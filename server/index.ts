import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { DEFAULT_LOCATIONS, DEFAULT_AREA_BOUNDARIES } from "./defaultData.js";
import {
  ApiError,
  applyPinPatch,
  applyZonePatch,
  buildPin,
  buildZone,
  filterActive,
  findById,
  migrateEntities,
  softDelete,
  validateMapName,
  type Pin,
  type Zone,
} from "./entities.js";

// Names of seeded entities, used to tag migrated rows with source "default".
const DEFAULT_PIN_NAMES = new Set(
  (DEFAULT_LOCATIONS as { name: string }[]).map((p) => p.name)
);
const DEFAULT_ZONE_NAMES = new Set(
  (DEFAULT_AREA_BOUNDARIES as { name: string }[]).map((z) => z.name)
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "maps.db");

// Ensure the data directory exists before opening the database
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Initialize SQLite database
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS maps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    user_added_markers TEXT NOT NULL DEFAULT '[]',
    user_added_zones TEXT NOT NULL DEFAULT '[]',
    removed_builtin_marker_names TEXT NOT NULL DEFAULT '[]',
    removed_builtin_zone_names TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Seed the database with a default map on first run
const mapCount = (db.prepare("SELECT COUNT(*) as count FROM maps").get() as { count: number }).count;
if (mapCount === 0) {
  const defaultId = uuidv4();
  db.prepare(
    "INSERT INTO maps (id, name, user_added_markers, user_added_zones, removed_builtin_marker_names, removed_builtin_zone_names) VALUES (?, ?, ?, ?, '[]', '[]')"
  ).run(defaultId, "Wales Trip", JSON.stringify(DEFAULT_LOCATIONS), JSON.stringify(DEFAULT_AREA_BOUNDARIES));
  console.log(`Seeded default map "Wales Trip" with id ${defaultId}`);
}

interface MapState {
  id: string;
  name: string;
  userAddedMarkers: Pin[];
  userAddedZones: Zone[];
  removedBuiltinMarkerNames: string[];
  removedBuiltinZoneNames: string[];
}

interface MapListItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface MapRow {
  id: string;
  name: string;
  user_added_markers: string;
  user_added_zones: string;
  removed_builtin_marker_names: string;
  removed_builtin_zone_names: string;
  created_at: string;
  updated_at: string;
}

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend static files in production
const clientDist = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(clientDist));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// Track WebSocket connections per map
const mapConnections = new Map<string, Set<WebSocket>>();

function validateUuid(mapId: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(mapId);
}

function readMap(mapId: string): MapState | null {
  const row = db.prepare("SELECT * FROM maps WHERE id = ?").get(mapId) as MapRow | undefined;
  if (!row) return null;

  // Migration / backfill (A1, A2): ensure every stored pin/zone carries a stable
  // id and soft-delete metadata. Persist back only when something changed so the
  // backfill is idempotent.
  const pins = migrateEntities<Pin>(JSON.parse(row.user_added_markers), DEFAULT_PIN_NAMES);
  const zones = migrateEntities<Zone>(JSON.parse(row.user_added_zones), DEFAULT_ZONE_NAMES);

  if (pins.changed || zones.changed) {
    db.prepare(
      "UPDATE maps SET user_added_markers = ?, user_added_zones = ? WHERE id = ?"
    ).run(JSON.stringify(pins.entities), JSON.stringify(zones.entities), mapId);
  }

  return {
    id: row.id,
    name: row.name,
    userAddedMarkers: pins.entities,
    userAddedZones: zones.entities,
    removedBuiltinMarkerNames: JSON.parse(row.removed_builtin_marker_names),
    removedBuiltinZoneNames: JSON.parse(row.removed_builtin_zone_names),
  };
}

/** Require a map to exist, throwing a structured MAP_NOT_FOUND otherwise. */
function requireMap(mapId: string): MapState {
  if (!validateUuid(mapId)) {
    throw new ApiError("VALIDATION_ERROR", "mapId must be a valid UUID", { field: "mapId" });
  }
  const map = readMap(mapId);
  if (!map) {
    throw new ApiError("MAP_NOT_FOUND", "Map not found", { mapId });
  }
  return map;
}

/** Persist pins/zones for a map, bump updated_at, and broadcast the new state. */
function persistEntities(mapId: string, pins: Pin[], zones: Zone[]): MapState {
  db.prepare(
    `UPDATE maps SET
      user_added_markers = ?,
      user_added_zones = ?,
      updated_at = datetime('now')
    WHERE id = ?`
  ).run(JSON.stringify(pins), JSON.stringify(zones), mapId);

  const updated = readMap(mapId)!;
  broadcastToMap(mapId, { type: "map-updated", data: updated });
  return updated;
}

function broadcastToMap(mapId: string, message: unknown, excludeWs?: WebSocket): void {
  const connections = mapConnections.get(mapId);
  if (!connections) return;

  const payload = JSON.stringify(message);
  for (const ws of connections) {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

// REST API

// Create a new map
app.post("/api/maps", (req, res) => {
  const name = validateMapName(req.body?.name);

  const id = uuidv4();
  db.prepare(
    "INSERT INTO maps (id, name, user_added_markers, user_added_zones, removed_builtin_marker_names, removed_builtin_zone_names) VALUES (?, ?, '[]', '[]', '[]', '[]')"
  ).run(id, name);

  const mapState = readMap(id)!;
  res.status(201).json(mapState);
});

// Get a map by ID
app.get("/api/maps/:id", (req, res) => {
  if (!validateUuid(req.params.id)) {
    res.status(400).json({ error: "Invalid map ID" });
    return;
  }

  const mapState = readMap(req.params.id);
  if (!mapState) {
    res.status(404).json({ error: "Map not found" });
    return;
  }
  res.json(mapState);
});

// Update a map
app.put("/api/maps/:id", (req, res) => {
  if (!validateUuid(req.params.id)) {
    res.status(400).json({ error: "Invalid map ID" });
    return;
  }

  const existing = readMap(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Map not found" });
    return;
  }

  const userAddedMarkers = req.body.userAddedMarkers ?? existing.userAddedMarkers;
  const userAddedZones = req.body.userAddedZones ?? existing.userAddedZones;
  const removedBuiltinMarkerNames = req.body.removedBuiltinMarkerNames ?? existing.removedBuiltinMarkerNames;
  const removedBuiltinZoneNames = req.body.removedBuiltinZoneNames ?? existing.removedBuiltinZoneNames;

  db.prepare(
    `UPDATE maps SET
      user_added_markers = ?,
      user_added_zones = ?,
      removed_builtin_marker_names = ?,
      removed_builtin_zone_names = ?,
      updated_at = datetime('now')
    WHERE id = ?`
  ).run(
    JSON.stringify(userAddedMarkers),
    JSON.stringify(userAddedZones),
    JSON.stringify(removedBuiltinMarkerNames),
    JSON.stringify(removedBuiltinZoneNames),
    req.params.id
  );

  const updated = readMap(req.params.id)!;

  // Broadcast update to all connected clients for this map
  broadcastToMap(req.params.id, { type: "map-updated", data: updated });

  res.json(updated);
});

// Delete a map
app.delete("/api/maps/:id", (req, res) => {
  if (!validateUuid(req.params.id)) {
    res.status(400).json({ error: "Invalid map ID" });
    return;
  }

  const existing = readMap(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Map not found" });
    return;
  }

  db.prepare("DELETE FROM maps WHERE id = ?").run(req.params.id);

  // Close any WebSocket connections for this map
  const connections = mapConnections.get(req.params.id);
  if (connections) {
    for (const ws of connections) {
      ws.close(1000, "Map deleted");
    }
    mapConnections.delete(req.params.id);
  }

  res.status(204).end();
});

// List all maps
app.get("/api/maps", (_req, res) => {
  const rows = db.prepare("SELECT id, name, created_at, updated_at FROM maps ORDER BY updated_at DESC").all() as MapRow[];
  const maps: MapListItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  res.json(maps);
});

// ---------------------------------------------------------------------------
// Entity-level pin endpoints (A4, A6)
// ---------------------------------------------------------------------------

function parseIncludeDeleted(req: Request): boolean {
  return req.query.includeDeleted === "true";
}

// List pins
app.get("/api/maps/:id/pins", (req, res) => {
  const map = requireMap(req.params.id);
  res.json(filterActive(map.userAddedMarkers, parseIncludeDeleted(req)));
});

// Create pin
app.post("/api/maps/:id/pins", (req, res) => {
  const map = requireMap(req.params.id);
  const pin = buildPin(req.body?.pin ?? req.body, "user");
  const pins = [...map.userAddedMarkers, pin];
  persistEntities(map.id, pins, map.userAddedZones);
  res.status(201).json(pin);
});

// Update pin (partial)
app.patch("/api/maps/:id/pins/:pinId", (req, res) => {
  const map = requireMap(req.params.id);
  const existing = findById(map.userAddedMarkers, req.params.pinId);
  if (!existing) {
    throw new ApiError("PIN_NOT_FOUND", "Pin not found", { pinId: req.params.pinId });
  }
  if (existing.isDeleted) {
    throw new ApiError("ENTITY_DELETED", "Cannot update a deleted pin", { pinId: existing.id });
  }
  const updated = applyPinPatch(existing, req.body?.patch ?? req.body);
  const pins = map.userAddedMarkers.map((p) => (p.id === updated.id ? updated : p));
  persistEntities(map.id, pins, map.userAddedZones);
  res.json(updated);
});

// Soft-delete pin
app.delete("/api/maps/:id/pins/:pinId", (req, res) => {
  const map = requireMap(req.params.id);
  const existing = findById(map.userAddedMarkers, req.params.pinId);
  if (!existing) {
    throw new ApiError("PIN_NOT_FOUND", "Pin not found", { pinId: req.params.pinId });
  }
  // Re-delete is idempotent: return the already-deleted entity unchanged.
  if (existing.isDeleted) {
    res.json(existing);
    return;
  }
  const deleted = softDelete(existing);
  const pins = map.userAddedMarkers.map((p) => (p.id === deleted.id ? deleted : p));
  persistEntities(map.id, pins, map.userAddedZones);
  res.json(deleted);
});

// ---------------------------------------------------------------------------
// Entity-level zone endpoints (A5, A6)
// ---------------------------------------------------------------------------

// List zones
app.get("/api/maps/:id/zones", (req, res) => {
  const map = requireMap(req.params.id);
  res.json(filterActive(map.userAddedZones, parseIncludeDeleted(req)));
});

// Create zone
app.post("/api/maps/:id/zones", (req, res) => {
  const map = requireMap(req.params.id);
  const zone = buildZone(req.body?.zone ?? req.body, "user");
  const zones = [...map.userAddedZones, zone];
  persistEntities(map.id, map.userAddedMarkers, zones);
  res.status(201).json(zone);
});

// Update zone (partial)
app.patch("/api/maps/:id/zones/:zoneId", (req, res) => {
  const map = requireMap(req.params.id);
  const existing = findById(map.userAddedZones, req.params.zoneId);
  if (!existing) {
    throw new ApiError("ZONE_NOT_FOUND", "Zone not found", { zoneId: req.params.zoneId });
  }
  if (existing.isDeleted) {
    throw new ApiError("ENTITY_DELETED", "Cannot update a deleted zone", { zoneId: existing.id });
  }
  const updated = applyZonePatch(existing, req.body?.patch ?? req.body);
  const zones = map.userAddedZones.map((z) => (z.id === updated.id ? updated : z));
  persistEntities(map.id, map.userAddedMarkers, zones);
  res.json(updated);
});

// Soft-delete zone
app.delete("/api/maps/:id/zones/:zoneId", (req, res) => {
  const map = requireMap(req.params.id);
  const existing = findById(map.userAddedZones, req.params.zoneId);
  if (!existing) {
    throw new ApiError("ZONE_NOT_FOUND", "Zone not found", { zoneId: req.params.zoneId });
  }
  if (existing.isDeleted) {
    res.json(existing);
    return;
  }
  const deleted = softDelete(existing);
  const zones = map.userAddedZones.map((z) => (z.id === deleted.id ? deleted : z));
  persistEntities(map.id, map.userAddedMarkers, zones);
  res.json(deleted);
});


wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const mapId = url.searchParams.get("mapId");

  if (!mapId) {
    ws.close(1008, "mapId query parameter required");
    return;
  }

  if (!validateUuid(mapId)) {
    ws.close(1008, "Invalid mapId format");
    return;
  }

  // Register connection
  if (!mapConnections.has(mapId)) {
    mapConnections.set(mapId, new Set());
  }
  mapConnections.get(mapId)!.add(ws);

  ws.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());

      if (message.type === "update-map") {
        const existing = readMap(mapId);
        if (!existing) return;

        const userAddedMarkers = message.data.userAddedMarkers ?? existing.userAddedMarkers;
        const userAddedZones = message.data.userAddedZones ?? existing.userAddedZones;
        const removedBuiltinMarkerNames = message.data.removedBuiltinMarkerNames ?? existing.removedBuiltinMarkerNames;
        const removedBuiltinZoneNames = message.data.removedBuiltinZoneNames ?? existing.removedBuiltinZoneNames;

        db.prepare(
          `UPDATE maps SET
            user_added_markers = ?,
            user_added_zones = ?,
            removed_builtin_marker_names = ?,
            removed_builtin_zone_names = ?,
            updated_at = datetime('now')
          WHERE id = ?`
        ).run(
          JSON.stringify(userAddedMarkers),
          JSON.stringify(userAddedZones),
          JSON.stringify(removedBuiltinMarkerNames),
          JSON.stringify(removedBuiltinZoneNames),
          mapId
        );

        const updated = readMap(mapId)!;

        // Broadcast to other clients
        broadcastToMap(mapId, { type: "map-updated", data: updated }, ws);
      }
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on("close", () => {
    const connections = mapConnections.get(mapId);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        mapConnections.delete(mapId);
      }
    }
  });
});

// Fallback to index.html for client-side routing
app.get("{*path}", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

// Centralized error handler: translate ApiError into the structured error
// contract, and surface anything else as a generic 500.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.httpStatus).json(err.toPayload());
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error", details: {} },
  });
});

const PORT = process.env.PORT ?? 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

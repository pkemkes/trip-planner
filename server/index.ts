import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { DEFAULT_LOCATIONS, DEFAULT_AREA_BOUNDARIES } from "./defaultData.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "maps.db");

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
  userAddedMarkers: unknown[];
  userAddedZones: unknown[];
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
const clientDist = path.join(__dirname, "..", "dist");
app.use(express.static(clientDist));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// Track WebSocket connections per map
const mapConnections = new Map<string, Set<WebSocket>>();

function validateUuid(mapId: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(mapId);
}

function rowToMapState(row: MapRow): MapState {
  return {
    id: row.id,
    name: row.name,
    userAddedMarkers: JSON.parse(row.user_added_markers),
    userAddedZones: JSON.parse(row.user_added_zones),
    removedBuiltinMarkerNames: JSON.parse(row.removed_builtin_marker_names),
    removedBuiltinZoneNames: JSON.parse(row.removed_builtin_zone_names),
  };
}

function readMap(mapId: string): MapState | null {
  const row = db.prepare("SELECT * FROM maps WHERE id = ?").get(mapId) as MapRow | undefined;
  if (!row) return null;
  return rowToMapState(row);
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
  const name = req.body.name;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "Map name is required" });
    return;
  }

  const id = uuidv4();
  db.prepare(
    "INSERT INTO maps (id, name, user_added_markers, user_added_zones, removed_builtin_marker_names, removed_builtin_zone_names) VALUES (?, ?, '[]', '[]', '[]', '[]')"
  ).run(id, name.trim());

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

// WebSocket handling
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

const PORT = process.env.PORT ?? 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

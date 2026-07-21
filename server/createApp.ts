import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import type DatabaseType from "better-sqlite3";
import path from "path";
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
  type EntityMetadata,
  type Pin,
  type Zone,
} from "./entities.js";

// Names of seeded entities, used to tag migrated rows with source "default".
const DEFAULT_PIN_NAMES = new Set((DEFAULT_LOCATIONS as { name: string }[]).map((p) => p.name));
const DEFAULT_ZONE_NAMES = new Set((DEFAULT_AREA_BOUNDARIES as { name: string }[]).map((z) => z.name));

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Database = DatabaseType.Database;

export interface MapState {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
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
  version: number;
  user_added_markers: string;
  user_added_zones: string;
  removed_builtin_marker_names: string;
  removed_builtin_zone_names: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAppOptions {
  /** Seed a default "Wales Trip" map when the maps table is empty. Default true. */
  seed?: boolean;
  /** Serve the built frontend and the SPA fallback route. Default true. */
  serveStatic?: boolean;
}

export interface TripPlannerApp {
  app: Express;
  httpServer: Server;
  wss: WebSocketServer;
  db: Database;
}

/**
 * Ensure the maps table and any additive columns exist. Safe to call on both
 * fresh and legacy databases (A2, A7 migrations are idempotent).
 */
export function initializeSchema(db: Database): void {
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS maps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      user_added_markers TEXT NOT NULL DEFAULT '[]',
      user_added_zones TEXT NOT NULL DEFAULT '[]',
      removed_builtin_marker_names TEXT NOT NULL DEFAULT '[]',
      removed_builtin_zone_names TEXT NOT NULL DEFAULT '[]',
      version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // A7: legacy databases created before optimistic concurrency lack the version
  // column. Add it once so concurrency checks have a monotonic token to compare.
  const columns = db.prepare("PRAGMA table_info(maps)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "version")) {
    db.exec("ALTER TABLE maps ADD COLUMN version INTEGER NOT NULL DEFAULT 0");
  }
}

/** Seed the default map on first run (only when the table is empty). */
export function seedDefaultMap(db: Database): void {
  const mapCount = (db.prepare("SELECT COUNT(*) as count FROM maps").get() as { count: number }).count;
  if (mapCount > 0) return;

  const defaultId = uuidv4();
  db.prepare(
    "INSERT INTO maps (id, name, user_added_markers, user_added_zones, removed_builtin_marker_names, removed_builtin_zone_names) VALUES (?, ?, ?, ?, '[]', '[]')"
  ).run(
    defaultId,
    "Wales Trip",
    JSON.stringify(DEFAULT_LOCATIONS),
    JSON.stringify(DEFAULT_AREA_BOUNDARIES)
  );
  console.log(`Seeded default map "Wales Trip" with id ${defaultId}`);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUuid(mapId: string): boolean {
  return UUID_REGEX.test(mapId);
}

/**
 * Merge an incoming (frontend) entity list with the stored one so soft-deleted
 * tombstones are preserved and can never be resurrected by a whole-map save
 * (A9). The frontend never receives deleted entities, so it always omits them;
 * we re-append the stored tombstones and drop any incoming entity that collides
 * with a deleted id.
 */
function mergePreservingDeleted<T extends EntityMetadata>(incoming: unknown, existing: T[]): T[] {
  const deleted = existing.filter((e) => e.isDeleted);
  const deletedIds = new Set(deleted.map((e) => e.id));
  const list = Array.isArray(incoming) ? (incoming as T[]) : [];
  const kept = list.filter((e) => !e || !deletedIds.has((e as EntityMetadata).id));
  return [...kept, ...deleted];
}

/** Public view of a map for whole-map read paths: active entities only (A9). */
function toPublicMapState(map: MapState): MapState {
  return {
    ...map,
    userAddedMarkers: filterActive(map.userAddedMarkers, false),
    userAddedZones: filterActive(map.userAddedZones, false),
  };
}

export function createApp(db: Database, options: CreateAppOptions = {}): TripPlannerApp {
  initializeSchema(db);
  if (options.seed !== false) seedDefaultMap(db);

  const app = express();
  app.use(cors());
  app.use(express.json());

  if (options.serveStatic !== false) {
    const clientDist = path.join(__dirname, "..", "frontend", "dist");
    app.use(express.static(clientDist));
  }

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  // Track WebSocket connections per map.
  const mapConnections = new Map<string, Set<WebSocket>>();

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

  /** Read the full stored map state, including soft-deleted entities. */
  function readMap(mapId: string): MapState | null {
    const row = db.prepare("SELECT * FROM maps WHERE id = ?").get(mapId) as MapRow | undefined;
    if (!row) return null;

    // Migration / backfill (A1, A2): ensure every stored pin/zone carries a
    // stable id and soft-delete metadata. Persist back only when something
    // changed so the backfill is idempotent (no version bump for backfills).
    const pins = migrateEntities<Pin>(JSON.parse(row.user_added_markers), DEFAULT_PIN_NAMES);
    const zones = migrateEntities<Zone>(JSON.parse(row.user_added_zones), DEFAULT_ZONE_NAMES);

    if (pins.changed || zones.changed) {
      db.prepare("UPDATE maps SET user_added_markers = ?, user_added_zones = ? WHERE id = ?").run(
        JSON.stringify(pins.entities),
        JSON.stringify(zones.entities),
        mapId
      );
    }

    return {
      id: row.id,
      name: row.name,
      version: row.version,
      updatedAt: row.updated_at,
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

  /**
   * Optimistic concurrency check (A7). When the caller opts in by supplying an
   * expected version (body.expectedVersion or ?expectedVersion=), reject the
   * write with CONFLICT if the stored map has moved on. The field is explicit
   * (not `version`) so the frontend, which echoes the whole map state back on
   * save, does not accidentally trigger concurrency checks. Omitting it keeps
   * writes backward compatible.
   */
  function assertVersionMatch(map: MapState, req: Request): void {
    const raw = req.body?.expectedVersion ?? req.query?.expectedVersion;
    if (raw === undefined || raw === null) return;
    const expected = Number(raw);
    if (!Number.isInteger(expected)) {
      throw new ApiError("VALIDATION_ERROR", "expectedVersion must be an integer", {
        field: "expectedVersion",
      });
    }
    if (expected !== map.version) {
      throw new ApiError("CONFLICT", "Map was modified by another writer; re-read and retry", {
        expectedVersion: expected,
        currentVersion: map.version,
      });
    }
  }

  /** Persist pins/zones, bump version + updated_at, and broadcast the new state. */
  function persistEntities(mapId: string, pins: Pin[], zones: Zone[]): MapState {
    db.prepare(
      `UPDATE maps SET
        user_added_markers = ?,
        user_added_zones = ?,
        version = version + 1,
        updated_at = datetime('now')
      WHERE id = ?`
    ).run(JSON.stringify(pins), JSON.stringify(zones), mapId);

    const updated = readMap(mapId)!;
    broadcastToMap(mapId, { type: "map-updated", data: toPublicMapState(updated) });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Map-level endpoints
  // -------------------------------------------------------------------------

  // Create a new map.
  app.post("/api/maps", (req, res) => {
    const name = validateMapName(req.body?.name);
    const id = uuidv4();
    db.prepare(
      "INSERT INTO maps (id, name, user_added_markers, user_added_zones, removed_builtin_marker_names, removed_builtin_zone_names) VALUES (?, ?, '[]', '[]', '[]', '[]')"
    ).run(id, name);
    res.status(201).json(toPublicMapState(readMap(id)!));
  });

  // Get a map by ID (active entities only, A9).
  app.get("/api/maps/:id", (req, res) => {
    const map = requireMap(req.params.id);
    res.json(toPublicMapState(map));
  });

  // Update a map (whole-map save). Preserves soft-delete tombstones (A9) and
  // honors optimistic concurrency when a version is supplied (A7).
  app.put("/api/maps/:id", (req, res) => {
    const existing = requireMap(req.params.id);
    assertVersionMatch(existing, req);

    const userAddedMarkers = mergePreservingDeleted<Pin>(
      req.body.userAddedMarkers ?? existing.userAddedMarkers,
      existing.userAddedMarkers
    );
    const userAddedZones = mergePreservingDeleted<Zone>(
      req.body.userAddedZones ?? existing.userAddedZones,
      existing.userAddedZones
    );
    const removedBuiltinMarkerNames =
      req.body.removedBuiltinMarkerNames ?? existing.removedBuiltinMarkerNames;
    const removedBuiltinZoneNames =
      req.body.removedBuiltinZoneNames ?? existing.removedBuiltinZoneNames;

    db.prepare(
      `UPDATE maps SET
        user_added_markers = ?,
        user_added_zones = ?,
        removed_builtin_marker_names = ?,
        removed_builtin_zone_names = ?,
        version = version + 1,
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
    broadcastToMap(req.params.id, { type: "map-updated", data: toPublicMapState(updated) });
    res.json(toPublicMapState(updated));
  });

  // Delete a map.
  app.delete("/api/maps/:id", (req, res) => {
    requireMap(req.params.id);
    db.prepare("DELETE FROM maps WHERE id = ?").run(req.params.id);

    const connections = mapConnections.get(req.params.id);
    if (connections) {
      for (const ws of connections) {
        ws.close(1000, "Map deleted");
      }
      mapConnections.delete(req.params.id);
    }
    res.status(204).end();
  });

  // List all maps.
  app.get("/api/maps", (_req, res) => {
    const rows = db
      .prepare("SELECT id, name, created_at, updated_at FROM maps ORDER BY updated_at DESC")
      .all() as MapRow[];
    const maps: MapListItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    res.json(maps);
  });

  // -------------------------------------------------------------------------
  // Entity-level pin endpoints (A4, A6)
  // -------------------------------------------------------------------------

  function parseIncludeDeleted(req: Request): boolean {
    return req.query.includeDeleted === "true";
  }

  app.get("/api/maps/:id/pins", (req, res) => {
    const map = requireMap(req.params.id);
    res.json(filterActive(map.userAddedMarkers, parseIncludeDeleted(req)));
  });

  app.post("/api/maps/:id/pins", (req, res) => {
    const map = requireMap(req.params.id);
    const pin = buildPin(req.body?.pin ?? req.body, "user");
    persistEntities(map.id, [...map.userAddedMarkers, pin], map.userAddedZones);
    res.status(201).json(pin);
  });

  app.patch("/api/maps/:id/pins/:pinId", (req, res) => {
    const map = requireMap(req.params.id);
    assertVersionMatch(map, req);
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

  app.delete("/api/maps/:id/pins/:pinId", (req, res) => {
    const map = requireMap(req.params.id);
    assertVersionMatch(map, req);
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

  // -------------------------------------------------------------------------
  // Entity-level zone endpoints (A5, A6)
  // -------------------------------------------------------------------------

  app.get("/api/maps/:id/zones", (req, res) => {
    const map = requireMap(req.params.id);
    res.json(filterActive(map.userAddedZones, parseIncludeDeleted(req)));
  });

  app.post("/api/maps/:id/zones", (req, res) => {
    const map = requireMap(req.params.id);
    const zone = buildZone(req.body?.zone ?? req.body, "user");
    persistEntities(map.id, map.userAddedMarkers, [...map.userAddedZones, zone]);
    res.status(201).json(zone);
  });

  app.patch("/api/maps/:id/zones/:zoneId", (req, res) => {
    const map = requireMap(req.params.id);
    assertVersionMatch(map, req);
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

  app.delete("/api/maps/:id/zones/:zoneId", (req, res) => {
    const map = requireMap(req.params.id);
    assertVersionMatch(map, req);
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

  // -------------------------------------------------------------------------
  // WebSocket sync
  // -------------------------------------------------------------------------

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

    if (!mapConnections.has(mapId)) {
      mapConnections.set(mapId, new Set());
    }
    mapConnections.get(mapId)!.add(ws);

    ws.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type !== "update-map") return;

        const existing = readMap(mapId);
        if (!existing) return;

        // Preserve soft-delete tombstones so a live sync cannot resurrect a
        // deleted entity (A9).
        const userAddedMarkers = mergePreservingDeleted<Pin>(
          message.data.userAddedMarkers ?? existing.userAddedMarkers,
          existing.userAddedMarkers
        );
        const userAddedZones = mergePreservingDeleted<Zone>(
          message.data.userAddedZones ?? existing.userAddedZones,
          existing.userAddedZones
        );
        const removedBuiltinMarkerNames =
          message.data.removedBuiltinMarkerNames ?? existing.removedBuiltinMarkerNames;
        const removedBuiltinZoneNames =
          message.data.removedBuiltinZoneNames ?? existing.removedBuiltinZoneNames;

        db.prepare(
          `UPDATE maps SET
            user_added_markers = ?,
            user_added_zones = ?,
            removed_builtin_marker_names = ?,
            removed_builtin_zone_names = ?,
            version = version + 1,
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
        broadcastToMap(mapId, { type: "map-updated", data: toPublicMapState(updated) }, ws);
      } catch {
        // Ignore malformed messages.
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

  // SPA fallback for client-side routing.
  if (options.serveStatic !== false) {
    const clientDist = path.join(__dirname, "..", "frontend", "dist");
    app.get("{*path}", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

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

  return { app, httpServer, wss, db };
}

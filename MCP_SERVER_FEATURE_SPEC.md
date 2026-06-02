# MCP Server Feature Spec: Map, Pin, and Zone Operations

## 1. Goal

Implement an MCP server that allows an LLM to:

1. Read all available maps.
2. Select one target map.
3. Create maps.
4. Fetch pins and zones for that map.
5. Create, edit, and soft-delete pins.
6. Create, edit, and soft-delete zones.

Map deletion is not allowed via MCP.

The design should be deterministic, safe under concurrent updates, and easy for an LLM to use with minimal ambiguity.

## 2. Current App Reality (From Existing Code)

The backend already exposes these map-level operations:

1. `GET /api/maps` (list maps)
2. `GET /api/maps/:id` (full map state)
3. `POST /api/maps` (create map)
4. `PUT /api/maps/:id` (replace selected map state fields)
5. `DELETE /api/maps/:id` (delete map)

A map state currently contains:

- `id`
- `name`
- `userAddedMarkers: MapLocation[]`
- `userAddedZones: AreaBoundary[]`
- `removedBuiltinMarkerNames: string[]`
- `removedBuiltinZoneNames: string[]`

Important implementation detail:

- Pins and zones do not currently have stable IDs.
- Frontend updates identify pins/zones by name and/or coordinates.
- For MCP and LLM safety, this is too ambiguous for reliable edit/delete.

## 3. Scope

### In Scope

1. New MCP server package/process.
2. MCP tools for map listing/selection, map creation, and pin/zone CRUD.
3. Backend API extensions (recommended) for entity-level pin/zone operations.
4. Validation and error handling appropriate for LLM tool-calling.
5. Optional live-update behavior with existing WebSocket broadcast compatibility.

### Out of Scope

1. Redesigning frontend UX.
2. Geo search/routing logic.
3. Authentication/authorization for the current increment (planned future enhancement).
4. Map deletion via MCP.

## 4. Recommended Architecture

## 4.1 MCP Server

Add a dedicated Node.js/TypeScript MCP server (workspace package), for example:

- `mcp-server/`

Responsibilities:

1. Expose MCP tools.
2. Translate tool calls into backend REST calls.
3. Normalize backend errors into structured MCP errors.
4. Provide concise, LLM-friendly outputs.

## 4.2 Backend API Evolution (Recommended)

Current `PUT /api/maps/:id` can still work, but robust MCP operations are much safer with entity-level endpoints and stable IDs.

Recommended additions:

1. `GET /api/maps/:id/pins`
2. `POST /api/maps/:id/pins`
3. `PATCH /api/maps/:id/pins/:pinId`
4. `DELETE /api/maps/:id/pins/:pinId` (soft delete)
5. `GET /api/maps/:id/zones`
6. `POST /api/maps/:id/zones`
7. `PATCH /api/maps/:id/zones/:zoneId`
8. `DELETE /api/maps/:id/zones/:zoneId` (soft delete)

If adding endpoints is deferred, MCP can perform read-modify-write against `GET/PUT /api/maps/:id`, but this increases race and ambiguity risk.

## 5. Data Contract Changes (Recommended)

## 5.1 Add Stable IDs and Soft-Delete Metadata

Add `id` to pins and zones, plus metadata that supports editing and soft-delete for both default and user entities.

### Pin shape

```json
{
  "id": "uuid",
  "source": "default | user",
  "isDeleted": false,
  "deletedAt": null,
  "deletedBy": null,
  "name": "string",
  "category": "Town | Village | Hike | Pub | Garden | Historic | Castle",
  "lat": 52.123,
  "lng": -3.456,
  "description": "string",
  "whyVisit": "string",
  "links": [{ "text": "string", "url": "https://..." }]
}
```

### Zone shape

```json
{
  "id": "uuid",
  "source": "default | user",
  "isDeleted": false,
  "deletedAt": null,
  "deletedBy": null,
  "name": "string",
  "category": "National Park | Scenic Area",
  "coords": [[52.1, -3.4], [52.2, -3.3], [52.15, -3.2]],
  "description": "string",
  "whyVisit": "string",
  "links": [{ "text": "string", "url": "https://..." }]
}
```

## 5.2 Migration Strategy

On map read/update, if an existing pin/zone is missing `id`, generate one and persist back.

During migration, initialize:

1. `source` as `default` for seeded entities and `user` for user-created entities.
2. `isDeleted` as `false`.
3. `deletedAt` and `deletedBy` as `null`.

This supports existing stored data without hard reset.

## 6. MCP Tool Surface

Design tools to be explicit and low-ambiguity.

## 6.1 Map Discovery and Selection

### `list_maps`

Purpose: return all maps for selection.

Includes maps created from both app UI and MCP.

Input:

```json
{}
```

Output:

```json
{
  "maps": [
    {
      "id": "uuid",
      "name": "Wales Trip",
      "updatedAt": "2026-06-02T12:00:00Z"
    }
  ]
}
```

### `create_map`

Purpose: create a new map.

Input:

```json
{ "name": "string" }
```

Output:

```json
{
  "id": "uuid",
  "name": "string",
  "createdAt": "2026-06-02T12:00:00Z",
  "updatedAt": "2026-06-02T12:00:00Z"
}
```

### `get_map_summary`

Purpose: fetch one map with high-level counts and metadata.

Input:

```json
{ "mapId": "uuid" }
```

Output:

```json
{
  "id": "uuid",
  "name": "Wales Trip",
  "pinCount": 12,
  "zoneCount": 4,
  "updatedAt": "2026-06-02T12:00:00Z"
}
```

## 6.2 Pin Tools

### `list_pins`

Input:

```json
{ "mapId": "uuid" }
```

Output: full pin list including IDs.

Default behavior should return only active (non-deleted) pins.

Optional input extension:

```json
{ "mapId": "uuid", "includeDeleted": true }
```

### `create_pin`

Input:

```json
{
  "mapId": "uuid",
  "pin": {
    "name": "Conwy",
    "category": "Town",
    "lat": 53.28,
    "lng": -3.83,
    "description": "...",
    "whyVisit": "...",
    "links": []
  }
}
```

Output: created pin with generated `id`.

### `update_pin`

Input:

```json
{
  "mapId": "uuid",
  "pinId": "uuid",
  "patch": {
    "name": "Conwy Old Town",
    "description": "updated text"
  }
}
```

Output: updated pin.

### `delete_pin`

Input:

```json
{
  "mapId": "uuid",
  "pinId": "uuid"
}
```

Output:

```json
{
  "id": "uuid",
  "isDeleted": true,
  "deletedAt": "2026-06-02T12:00:00Z",
  "deletedBy": null
}
```

Behavior:

1. Soft delete only.
2. Applies to both `source: "default"` and `source: "user"` pins.
3. Mutation returns only the changed entity.

## 6.3 Zone Tools

### `list_zones`

Input:

```json
{ "mapId": "uuid" }
```

Output: full zone list including IDs.

Default behavior should return only active (non-deleted) zones.

Optional input extension:

```json
{ "mapId": "uuid", "includeDeleted": true }
```

### `create_zone`

Input:

```json
{
  "mapId": "uuid",
  "zone": {
    "name": "Snowdonia",
    "category": "National Park",
    "coords": [[53.1, -4.1], [53.2, -4.0], [53.0, -3.9]],
    "description": "...",
    "whyVisit": "...",
    "links": []
  }
}
```

Output: created zone with generated `id`.

### `update_zone`

Input:

```json
{
  "mapId": "uuid",
  "zoneId": "uuid",
  "patch": {
    "name": "Eryri National Park",
    "coords": [[53.1, -4.1], [53.2, -4.0], [53.0, -3.9], [53.05, -4.2]]
  }
}
```

Output: updated zone.

### `delete_zone`

Input:

```json
{
  "mapId": "uuid",
  "zoneId": "uuid"
}
```

Output:

```json
{
  "id": "uuid",
  "isDeleted": true,
  "deletedAt": "2026-06-02T12:00:00Z",
  "deletedBy": null
}
```

Behavior:

1. Soft delete only.
2. Applies to both `source: "default"` and `source: "user"` zones.
3. Mutation returns only the changed entity.

## 7. Validation Rules

1. `mapId`, `pinId`, `zoneId` must be valid UUIDs.
2. Pin category must be one of marker categories.
3. Zone category must be one of zone categories.
4. Latitude range: -90 to 90.
5. Longitude range: -180 to 180.
6. Zone must have at least 3 coordinates.

## 8. Error Contract

MCP tools normalize backend errors into a structured payload:

```json
{
  "code": "string",
  "message": "string",
  "details": {}
}
```

Defined error codes:

1. `MAP_NOT_FOUND` — referenced map id does not exist.
2. `PIN_NOT_FOUND` — referenced pin id does not exist on the map.
3. `ZONE_NOT_FOUND` — referenced zone id does not exist on the map.
4. `VALIDATION_ERROR` — input failed a validation rule in Section 7.
5. `CONFLICT` — stale write rejected by optimistic concurrency check.
6. `ENTITY_DELETED` — mutation attempted on an already soft-deleted entity.
7. `BACKEND_UNAVAILABLE` — backend REST call failed or was unreachable.

Re-deleting an already soft-deleted entity is deterministic: either idempotent
(returns the current deleted entity) or returns `ENTITY_DELETED`, per the chosen
backend API rule.
7. `links[].url` must be valid absolute URL.
8. `name`, `description`, `whyVisit` must be non-empty strings.
9. Mutating a deleted entity should return `ENTITY_DELETED` unless restore is explicitly supported later.

## 8. Concurrency and Safety

Minimum recommended behavior:

1. Use map-level optimistic concurrency with `updated_at` or version token.
2. Reject stale writes with conflict error (HTTP 409 equivalent).
3. MCP returns a conflict message advising re-read and retry.

Better behavior:

1. Entity-level endpoints apply atomic updates for one pin/zone.
2. Still preserve map `updated_at` changes and WebSocket broadcasts.

## 9. Error Model for MCP Responses

Use predictable error codes so LLM can recover:

1. `MAP_NOT_FOUND`
2. `PIN_NOT_FOUND`
3. `ZONE_NOT_FOUND`
4. `VALIDATION_ERROR`
5. `CONFLICT`
6. `BACKEND_UNAVAILABLE`
7. `ENTITY_DELETED`

Error payload shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "coords must contain at least 3 vertices",
    "details": {
      "field": "coords"
    }
  }
}
```

## 10. Implementation Plan

## Phase 1: Backend hardening

1. Add stable IDs and soft-delete metadata to pin/zone schema.
2. Add migration logic for existing map rows.
3. Add entity-level pin/zone endpoints with soft delete.
4. Keep existing map endpoints for backward compatibility.

## Phase 2: MCP server

1. Scaffold TypeScript MCP server package.
2. Implement tool handlers listed above.
3. Add runtime config for backend base URL.
4. Add structured logging and error normalization.

## Phase 3: Verification

1. Unit tests for validation.
2. Integration tests for create/update/delete flows.
3. Conflict-path tests (simulated concurrent write).
4. Manual test with MCP client and real map data.

## 11. Acceptance Criteria

1. LLM can list maps and choose one by `mapId`.
2. LLM can create maps.
3. LLM can list pins and zones with stable IDs.
4. LLM can create pin/zone and receive only the created entity.
5. LLM can update pin/zone by ID (including default and user entities) and receive only the changed entity.
6. LLM can soft-delete pin/zone by ID (including default and user entities) and receive only the changed entity.
7. LLM cannot delete maps via MCP.
8. Invalid input returns structured validation errors.
9. Concurrent modification returns conflict error, not silent overwrite.

## 12. Decisions Captured

1. MCP can create and use maps, but cannot delete maps.
2. Edit and delete operations apply to both default and user entities.
3. Deletion model is soft delete.
4. Current implementation is open (no auth).
5. Authentication is planned later for both app and MCP server.
6. Mutation tools return only the changed entity.

## 13. Future Auth Track

When auth is introduced later:

1. Add app-level auth and principal propagation.
2. Require MCP credentials (service token or user OAuth flow).
3. Populate `deletedBy` from authenticated principal instead of `null`.
4. Apply per-map authorization checks before mutation.

## 14. Suggested First Increment

Implement this minimal vertical slice first:

1. `list_maps`
2. `list_pins`
3. `create_pin`
4. `update_pin`
5. `delete_pin`

Then repeat same pattern for zones.

This sequence delivers immediate usefulness while keeping risk low.
# Trip Planner

Interactive map application for planning trips. Built with React, Leaflet, and an Express/SQLite backend with real-time sync via WebSockets. An optional [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server lets an LLM read and edit maps, pins, and zones.

## Running Locally

### Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io/)

### Install dependencies

```bash
pnpm install
```

### Start the backend server

```bash
pnpm dev:server
```

The server starts on `http://localhost:3001` and stores data in `data/maps.db` (relative to the repo root).

### Start the frontend dev server

```bash
pnpm dev
```

The Vite dev server starts on `http://localhost:5173` and proxies `/api` and `/ws` requests to the backend.

## Running with Docker

### Build and run the image

```bash
docker build -t trip-planner .
docker run -p 3001:3001 -p 3002:3002 -v trip-planner-data:/app/data trip-planner
```

The production build serves both the API and the static frontend on port 3001. The volume persists the SQLite database at `/app/data/maps.db`. The MCP server runs alongside the backend in the same container and exposes its Streamable HTTP endpoint at `http://localhost:3002/mcp`.

### Docker Compose

Create a `docker-compose.yml`:

```yaml
services:
  trip-planner:
    build: .
    ports:
      - "3001:3001"
      - "3002:3002"
    volumes:
      - trip-planner-data:/app/data
    restart: unless-stopped

volumes:
  trip-planner-data:
```

Then run:

```bash
docker compose up -d
```

The app is available at `http://localhost:3001`.

## MCP Server

The `mcp-server/` package exposes trip-planner functionality as MCP tools so an
LLM can list and create maps and create, edit, and soft-delete pins and zones.
It is a thin layer over the REST backend and does not talk to the database
directly.

### Setup and run

The MCP server needs a running backend (see [Start the backend server](#start-the-backend-server)).

```bash
pnpm dev:mcp      # start the MCP server in watch mode (stdio transport)
pnpm build:mcp    # compile to mcp-server/dist
```

After building, the server can be launched directly (e.g. from an MCP client
config) via its stdio entrypoint:

```bash
node mcp-server/dist/index.js
```

### Environment variables

| Variable           | Default                 | Description                       |
| ------------------ | ----------------------- | --------------------------------- |
| `BACKEND_BASE_URL` | `http://localhost:3001` | Base URL of the REST backend API. |

The server communicates over stdio (JSON-RPC); diagnostic logs are written to
stderr so they never corrupt the protocol stream.

### Tools

| Tool              | Purpose                                                              |
| ----------------- | ------------------------------------------------------------------- |
| `list_maps`       | List all maps as `{ id, name, updatedAt }`.                         |
| `create_map`      | Create a map by name; returns the new map record.                   |
| `get_map_summary` | Return a map's id, name, active pin/zone counts, and `updatedAt`.   |
| `list_pins`       | List a map's pins; accepts `includeDeleted`.                        |
| `create_pin`      | Create a pin; returns only the created pin.                         |
| `update_pin`      | Partially update a pin by id; returns only the updated pin.         |
| `delete_pin`      | Soft-delete a pin by id; returns only the changed entity.           |
| `list_zones`      | List a map's zones; accepts `includeDeleted`.                       |
| `create_zone`     | Create a zone; returns only the created zone.                       |
| `update_zone`     | Partially update a zone by id; returns only the updated zone.       |
| `delete_zone`     | Soft-delete a zone by id; returns only the changed entity.          |

Mutation tools return only the changed entity to keep responses compact and
unambiguous for tool-calling.

### Soft delete and `includeDeleted`

Deletes are **soft**: the entity is flagged with `isDeleted: true` and a
`deletedAt` timestamp instead of being removed. This applies to both
default (seeded) and user-created entities.

- `list_pins` / `list_zones` return only active entities by default. Pass
  `includeDeleted: true` to also return soft-deleted ones.
- The whole-map read paths (`GET /api/maps/:id` and the WebSocket
  `map-updated` broadcast) always exclude soft-deleted entities, so a pin or
  zone deleted via MCP disappears from the frontend and cannot be resurrected
  by a subsequent whole-map save.
- Re-deleting an already soft-deleted entity is idempotent: it returns the
  existing tombstone unchanged.

### Error contract

Failures are normalized into `{ error: { code, message, details } }` with one of
these codes: `MAP_NOT_FOUND`, `PIN_NOT_FOUND`, `ZONE_NOT_FOUND`,
`VALIDATION_ERROR`, `CONFLICT`, `ENTITY_DELETED`, `BACKEND_UNAVAILABLE`.

### Optimistic concurrency

Entity writes and whole-map saves accept an optional `expectedVersion` (the map
`version` returned by `GET /api/maps/:id`). When supplied, a stale value is
rejected with `CONFLICT`; re-read the map to get the current version and retry.
Omitting it skips the check for backward compatibility.

### Limitations

- **Map deletion is not available via MCP.** No `delete_map` tool is registered
  and the deletion endpoint cannot be reached through the MCP surface.
- Authentication is not yet implemented; `deletedBy` is always `null`.

## Testing

```bash
pnpm test   # runs the server and MCP server test suites
```

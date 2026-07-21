# MCP Server Deployment Tickets

This ticket plan makes the MCP server reachable over the internet when the
trip-planner is deployed. It covers two steps:

1. Fully switch the MCP server from stdio to the Streamable HTTP transport.
2. Add the MCP server to the Docker deployment so it runs alongside the backend.

Authentication and authorization are explicitly **out of scope** for this plan
and tracked separately.

## Design Decisions

These decisions apply across all tickets below:

- **Transport:** Streamable HTTP only. The stdio transport is removed entirely.
- **Session mode:** Stateless — a fresh `McpServer` and
  `StreamableHTTPServerTransport` are created per request. No `Mcp-Session-Id`
  handling and no SSE stream resumability.
- **Endpoint path:** `/mcp`.
- **Port:** `3002` by default, overridable via an env var.
- **Deployment topology:** Same Docker image as the backend, run as a second
  long-lived process in the same container via a shared entrypoint.

## Delivery Plan

1. Epic A: Switch MCP transport to Streamable HTTP
2. Epic B: Add MCP server to the Docker deployment
3. Epic C: Documentation updates

## Priority and Milestones

1. Milestone 1: A1-A3 (transport switch)
2. Milestone 2: B1-B2 (deployment)
3. Milestone 3: C1 (docs)

## Epic A: Switch MCP Transport to Streamable HTTP

### A1. Replace stdio transport with a stateless Streamable HTTP server

- Type: MCP
- Priority: P0
- Dependencies: None
- Description:
  - Remove the `StdioServerTransport` wiring from `mcp-server/src/index.ts`.
  - Stand up an HTTP server (Express, consistent with the backend) that serves
    the MCP endpoint at `POST /mcp`.
  - Use `StreamableHTTPServerTransport` in stateless mode: on each request,
    create a fresh `McpServer`, register tools, and connect a new transport
    with `sessionIdGenerator: undefined`; close both when the response ends.
  - Reject `GET` and `DELETE` on `/mcp` with `405 Method Not Allowed`, since a
    stateless server has no long-lived session or server-initiated stream.
  - Keep diagnostic logs on stderr / a logger; no stdio JSON-RPC stream remains
    to protect, but logs must not be written to the HTTP response body.
- Acceptance criteria:
  - The server no longer imports or uses `StdioServerTransport`.
  - `POST /mcp` performs a full MCP initialize + `tools/list` + `tools/call`
    round trip using the Streamable HTTP client transport.
  - Each request is handled independently with no shared session state.
  - `GET /mcp` and `DELETE /mcp` return `405`.

### A2. Add HTTP host/port configuration

- Type: MCP
- Priority: P0
- Dependencies: A1
- Description:
  - Extend `loadConfig` in `mcp-server/src/config.ts` with `port` (default
    `3002`) and `host` (default `0.0.0.0` so the container is reachable
    externally), read from `MCP_PORT` and `MCP_HOST`.
  - Keep the existing `BACKEND_BASE_URL` behavior unchanged.
  - Log the bound host, port, endpoint path, and backend target on startup.
- Acceptance criteria:
  - With no env vars set, the server listens on `0.0.0.0:3002`.
  - `MCP_PORT` and `MCP_HOST` override the defaults.
  - Startup log reports the effective host, port, `/mcp` path, and backend URL.

### A3. Update MCP server tests for the HTTP transport

- Type: Testing
- Priority: P0
- Dependencies: A1, A2
- Description:
  - Update `integration.test.ts` (and any stdio-specific test setup) to start
    the HTTP server on an ephemeral port and drive it with the Streamable HTTP
    client transport instead of spawning a stdio process.
  - Cover a successful tool call and a `405` on `GET /mcp`.
  - Keep `tools.test.ts` / `backendClient.test.ts` transport-agnostic.
- Acceptance criteria:
  - `pnpm test` passes with no stdio spawning.
  - Integration test exercises a real `POST /mcp` round trip against a running
    HTTP listener.
  - A negative test asserts `405` for unsupported methods on `/mcp`.

## Epic B: Add MCP Server to the Docker Deployment

### B1. Build and include the MCP server in the production image

- Type: Deployment
- Priority: P0
- Dependencies: A1
- Description:
  - Add `mcp-server/package.json` to the dependency install stage so its deps
    are resolved in the workspace install.
  - Add a build stage that compiles `mcp-server/` to `mcp-server/dist`.
  - Copy the built MCP server and its `node_modules` into the production image.
  - `EXPOSE 3002` in addition to the existing `3001`.
- Acceptance criteria:
  - The production image contains `mcp-server/dist/index.js` and its runtime
    dependencies.
  - `docker build` succeeds with no missing-module errors for the MCP server.
  - Both `3001` and `3002` are exposed.

### B2. Run backend and MCP server as two processes in one container

- Type: Deployment
- Priority: P0
- Dependencies: B1
- Description:
  - Add a container entrypoint (script or minimal process supervisor) that
    starts the backend (`server`) and the MCP server (`mcp-server/dist`)
    together, forwards signals, and exits the container if either process dies.
  - Replace the single `CMD ["pnpm", "start"]` with the entrypoint.
  - Ensure the MCP server points at the backend via `BACKEND_BASE_URL`
    (defaults to `http://localhost:3001` within the shared container).
  - Update the documented `docker run` / compose examples to publish `3002`.
- Acceptance criteria:
  - Starting the container brings up both the backend on `3001` and the MCP
    endpoint on `3002/mcp`.
  - Killing either process causes the container to stop (no silent half-up
    state).
  - An external `POST http://<host>:3002/mcp` completes an MCP round trip.

## Epic C: Documentation Updates

### C1. Update README and AGENTS docs for HTTP transport and deployment

- Type: Docs
- Priority: P1
- Dependencies: A1, A2, B2
- Description:
  - In `README.md`, replace stdio references in the "MCP Server" section:
    describe the Streamable HTTP transport, the `/mcp` endpoint, and the
    stateless model; remove the `node mcp-server/dist/index.js` stdio launch
    note in favor of running the HTTP server.
  - Document the new environment variables (`MCP_PORT`, `MCP_HOST`) alongside
    `BACKEND_BASE_URL`.
  - Update the "Running with Docker" section so the run/compose examples
    publish port `3002` and mention the MCP endpoint URL.
  - Note that the MCP server is now reachable over the network and that
    authentication is still not implemented (deploy behind a trusted boundary
    until the auth track lands).
  - Update `AGENTS.md` if any command or port facts change.
- Acceptance criteria:
  - No remaining references to stdio for the MCP server in `README.md`.
  - README documents the `/mcp` HTTP endpoint, port `3002`, and the new env
    vars.
  - Docker docs show `3002` published and reference the MCP endpoint.

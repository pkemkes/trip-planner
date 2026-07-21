# AGENTS.md

Guidance for AI agents and contributors working in this repository.

## Project Overview

Trip Planner is an interactive map application for planning trips. It is a
pnpm monorepo with three workspace packages:

- **`frontend/`** — React 19 + Vite single-page app using Leaflet (via
  react-leaflet) for the map and MUI for UI. Talks to the backend over REST
  (`/api`) and receives real-time updates over WebSockets (`/ws`).
- **`server/`** — Express 5 backend with a SQLite database (better-sqlite3).
  Serves the REST API, the WebSocket sync channel, and (in production) the
  static frontend build.
- **`mcp-server/`** — Model Context Protocol server that exposes trip-planner
  functionality as MCP tools, backed by the same server API.

## Tech Stack

- Language: TypeScript (ESM, `"type": "module"` in all packages)
- Package manager: pnpm workspaces
- Node.js: 22+
- Frontend: React 19, Vite, Leaflet / react-leaflet, MUI, Emotion
- Backend: Express 5, better-sqlite3, ws (WebSockets)
- MCP: `@modelcontextprotocol/sdk`, zod

## Getting Started

```bash
pnpm install        # install all workspace dependencies
pnpm dev:server     # start backend on http://localhost:3001 (data in data/maps.db)
pnpm dev            # start Vite dev server on http://localhost:5173 (proxies /api and /ws)
```

## Common Commands

Run these from the repository root:

| Command            | Description                                        |
| ------------------ | -------------------------------------------------- |
| `pnpm dev`         | Start the frontend dev server                      |
| `pnpm dev:server`  | Start the backend server (watch mode)              |
| `pnpm dev:mcp`     | Start the MCP server (watch mode)                  |
| `pnpm build`       | Build the frontend for production                  |
| `pnpm build:mcp`   | Build the MCP server                               |
| `pnpm lint`        | Lint the frontend                                  |
| `pnpm test`        | Run server and MCP server tests                    |

## Code Style

Prioritize human readability above all. Follow clean code guidelines:

- Keep functions and methods short — each should do one thing.
- Use clear, descriptive names for functions, variables, and types.
- Keep files focused and reasonably sized; split large files by extracting
  related functionality into separate modules.
- Extract reusable or self-contained logic into its own file or function
  rather than inlining or duplicating it.
- Avoid deep nesting; prefer early returns and small helpers.
- Write code that reads top-to-bottom without needing extra explanation;
  add comments only when the "why" isn't obvious from the code.

## Conventions

- All packages use ESM and TypeScript. Prefer explicit types at module
  boundaries.
- Tests use the built-in Node.js test runner (`node --test`) with `tsx`, in
  `*.test.ts` files colocated with the code they test.
- The frontend is linted with ESLint (`pnpm lint`); keep it clean before
  finishing changes.
- The SQLite database lives at `data/maps.db` relative to the repo root and is
  created automatically on first run.

## Before You Finish

- Run `pnpm lint` for frontend changes.
- Run `pnpm test` for server or MCP server changes.
- Do not commit the local `data/` database contents.

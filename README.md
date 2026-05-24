# Trip Planner

Interactive map application for planning trips. Built with React, Leaflet, and an Express/SQLite backend with real-time sync via WebSockets.

## Running Locally

### Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io/)

### Install dependencies

```bash
pnpm install
cd server && pnpm install
```

### Start the backend server

```bash
pnpm dev:server
```

The server starts on `http://localhost:3001` and stores data in `server/maps.db`.

### Start the frontend dev server

```bash
pnpm dev
```

The Vite dev server starts on `http://localhost:5173` and proxies `/api` and `/ws` requests to the backend.

## Running with Docker

### Build and run the image

```bash
docker build -t trip-planner .
docker run -p 3001:3001 -v trip-planner-data:/app/server trip-planner
```

The production build serves both the API and the static frontend on port 3001.

### Docker Compose

Create a `docker-compose.yml`:

```yaml
services:
  trip-planner:
    build: .
    ports:
      - "3001:3001"
    volumes:
      - trip-planner-data:/app/server
    restart: unless-stopped

volumes:
  trip-planner-data:
```

Then run:

```bash
docker compose up -d
```

The app is available at `http://localhost:3001`.

FROM node:22-alpine AS base
RUN corepack enable

# --- Install all workspace dependencies ---
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/
COPY server/package.json ./server/
COPY mcp-server/package.json ./mcp-server/
RUN pnpm install --frozen-lockfile

# --- Build frontend ---
FROM deps AS frontend-build
WORKDIR /app/frontend
COPY frontend/src/ ./src/
COPY frontend/public/ ./public/
COPY frontend/index.html frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json frontend/vite.config.ts frontend/eslint.config.js ./
RUN pnpm build

# --- Build MCP server ---
FROM deps AS mcp-build
WORKDIR /app/mcp-server
COPY mcp-server/src/ ./src/
COPY mcp-server/tsconfig.json ./
RUN pnpm build

# --- Production image ---
FROM base AS production
WORKDIR /app

COPY server/ ./server/
COPY mcp-server/package.json ./mcp-server/
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=deps /app/mcp-server/node_modules ./mcp-server/node_modules
COPY --from=mcp-build /app/mcp-server/dist ./mcp-server/dist
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN mkdir -p /app/data

# The MCP server reaches the backend within the same container.
ENV BACKEND_BASE_URL=http://localhost:3001

# 3001: REST API + frontend. 3002: MCP Streamable HTTP endpoint (/mcp).
EXPOSE 3001 3002
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]

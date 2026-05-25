FROM node:22-alpine AS base
RUN corepack enable

# --- Install all workspace dependencies ---
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/
COPY server/package.json ./server/
RUN pnpm install --frozen-lockfile

# --- Build frontend ---
FROM deps AS frontend-build
WORKDIR /app/frontend
COPY frontend/src/ ./src/
COPY frontend/public/ ./public/
COPY frontend/index.html frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json frontend/vite.config.ts frontend/eslint.config.js ./
RUN pnpm build

# --- Production image ---
FROM base AS production
WORKDIR /app

COPY server/ ./server/
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
RUN mkdir -p /app/data

EXPOSE 3001
WORKDIR /app/server
CMD ["pnpm", "start"]

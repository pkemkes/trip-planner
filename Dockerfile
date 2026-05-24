FROM node:22-alpine AS base
RUN corepack enable

# --- Build frontend ---
FROM base AS frontend-build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts eslint.config.js ./
COPY index.html ./
COPY src/ ./src/
COPY public/ ./public/
RUN pnpm build

# --- Install server dependencies ---
FROM base AS server-deps
WORKDIR /app/server
COPY server/package.json server/pnpm-lock.yaml server/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- Production image ---
FROM base AS production
WORKDIR /app

COPY server/ ./server/
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY --from=frontend-build /app/dist ./dist

EXPOSE 3001
WORKDIR /app/server
CMD ["pnpm", "start"]

#!/bin/sh
# Container entrypoint: run the backend and the MCP server side by side.
# If either process exits, tear the other down and stop the container so we
# never end up in a silent half-up state. Signals are forwarded to both.
set -u

pids=""

shutdown() {
  # Stop forwarding to avoid re-entering while we clean up.
  trap - TERM INT
  kill -TERM $pids 2>/dev/null || true
  wait
  exit 0
}
trap shutdown TERM INT

echo "[entrypoint] starting backend (server) on :3001"
( cd /app/server && exec pnpm start ) &
backend_pid=$!
pids="$pids $backend_pid"

echo "[entrypoint] starting MCP server on :${MCP_PORT:-3002}${MCP_ENDPOINT:-/mcp}"
node /app/mcp-server/dist/index.js &
mcp_pid=$!
pids="$pids $mcp_pid"

# Supervise: wait until either process exits, then bring everything down.
while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$mcp_pid" 2>/dev/null; do
  sleep 1
done

echo "[entrypoint] a managed process exited, stopping container"
kill -TERM $pids 2>/dev/null || true
wait
exit 1

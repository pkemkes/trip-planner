import { BackendClient } from "./backendClient.js";
import { createHttpApp, MCP_ENDPOINT } from "./app.js";
import { loadConfig } from "./config.js";
import { REGISTERED_TOOL_NAMES } from "./tools.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const backend = new BackendClient({ baseUrl: config.backendBaseUrl });
  const app = createHttpApp(backend);

  app.listen(config.port, config.host, () => {
    // Logs go to stderr and never to the HTTP response body.
    console.error(
      `[trip-planner-mcp] listening on http://${config.host}:${config.port}${MCP_ENDPOINT} ` +
        `backend=${config.backendBaseUrl} tools=${REGISTERED_TOOL_NAMES.length} ` +
        `(${REGISTERED_TOOL_NAMES.join(", ")})`
    );
  });
}

main().catch((err) => {
  console.error("[trip-planner-mcp] fatal:", err);
  process.exit(1);
});

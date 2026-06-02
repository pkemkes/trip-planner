import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BackendClient } from "./backendClient.js";
import { loadConfig } from "./config.js";
import { registerTools, REGISTERED_TOOL_NAMES } from "./tools.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const backend = new BackendClient({ baseUrl: config.backendBaseUrl });

  const server = new McpServer({
    name: "trip-planner-mcp-server",
    version: "1.0.0",
  });

  registerTools(server, backend);

  // Health log confirming tool registration and backend target. Logs go to
  // stderr so they never corrupt the stdio JSON-RPC stream.
  console.error(
    `[trip-planner-mcp] backend=${config.backendBaseUrl} tools=${REGISTERED_TOOL_NAMES.length} (${REGISTERED_TOOL_NAMES.join(", ")})`
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[trip-planner-mcp] server ready on stdio");
}

main().catch((err) => {
  console.error("[trip-planner-mcp] fatal:", err);
  process.exit(1);
});

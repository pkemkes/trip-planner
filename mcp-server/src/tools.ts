import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BackendClient } from "./backendClient.js";
import { registerMapTools } from "./mapTools.js";
import { registerPinTools } from "./pinTools.js";
import { registerZoneTools } from "./zoneTools.js";

/** Register every MCP tool against the server, backed by the REST client. */
export function registerTools(server: McpServer, backend: BackendClient): void {
  registerMapTools(server, backend);
  registerPinTools(server, backend);
  registerZoneTools(server, backend);
}

/** Names of every registered tool. Used for tests asserting C7. */
export const REGISTERED_TOOL_NAMES = [
  "list_maps",
  "create_map",
  "get_map_summary",
  "list_pins",
  "create_pin",
  "update_pin",
  "delete_pin",
  "list_zones",
  "create_zone",
  "update_zone",
  "delete_zone",
] as const;

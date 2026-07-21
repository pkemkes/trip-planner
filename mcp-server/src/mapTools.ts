import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BackendClient, McpToolError } from "./backendClient.js";
import { uuid } from "./schemas.js";
import { ok, handler } from "./results.js";
import type { MapListItem, MapState, Pin, Zone } from "./types.js";

/** Register map discovery and selection tools (B2, B3, B4). */
export function registerMapTools(server: McpServer, backend: BackendClient): void {
  server.registerTool(
    "list_maps",
    {
      title: "List maps",
      description:
        "List all available maps (from app UI and MCP) so a target map can be selected by id.",
      inputSchema: {},
    },
    handler(async () => {
      const maps = await backend.request<MapListItem[]>("/api/maps");
      return ok({
        maps: maps.map((m) => ({ id: m.id, name: m.name, updatedAt: m.updatedAt })),
      });
    })
  );

  server.registerTool(
    "create_map",
    {
      title: "Create map",
      description: "Create a new map by name. Returns only the newly created map record.",
      inputSchema: { name: z.string().min(1) },
    },
    handler(async ({ name }) => {
      const map = await backend.request<MapState>("/api/maps", {
        method: "POST",
        body: { name },
      });
      return ok({ id: map.id, name: map.name });
    })
  );

  server.registerTool(
    "get_map_summary",
    {
      title: "Get map summary",
      description: "Return a map's id, name, active pin/zone counts, and updatedAt.",
      inputSchema: { mapId: uuid },
    },
    handler(async ({ mapId }) => {
      // Pull list metadata for updatedAt, and active entity counts.
      const [maps, pins, zones] = await Promise.all([
        backend.request<MapListItem[]>("/api/maps"),
        backend.request<Pin[]>(`/api/maps/${mapId}/pins`),
        backend.request<Zone[]>(`/api/maps/${mapId}/zones`),
      ]);
      const meta = maps.find((m) => m.id === mapId);
      if (!meta) {
        throw new McpToolError("MAP_NOT_FOUND", "Map not found", { mapId });
      }
      return ok({
        id: meta.id,
        name: meta.name,
        pinCount: pins.length,
        zoneCount: zones.length,
        updatedAt: meta.updatedAt,
      });
    })
  );

  // Note (C7): no delete_map tool is registered. Map deletion is intentionally
  // unreachable through the MCP surface.
}

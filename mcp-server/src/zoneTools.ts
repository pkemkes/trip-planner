import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BackendClient } from "./backendClient.js";
import { uuid, zoneInputSchema, zonePatchSchema } from "./schemas.js";
import { ok, handler } from "./results.js";
import type { Zone } from "./types.js";

/** Register zone CRUD tools (C4, C5, C6). */
export function registerZoneTools(server: McpServer, backend: BackendClient): void {
  server.registerTool(
    "list_zones",
    {
      title: "List zones",
      description:
        "List zones for a map with stable ids. Excludes soft-deleted zones unless includeDeleted is true.",
      inputSchema: { mapId: uuid(), includeDeleted: z.boolean().optional() },
    },
    handler(async ({ mapId, includeDeleted }) => {
      const zones = await backend.request<Zone[]>(`/api/maps/${mapId}/zones`, {
        query: { includeDeleted: includeDeleted ? "true" : undefined },
      });
      return ok({ zones });
    })
  );

  server.registerTool(
    "create_zone",
    {
      title: "Create zone",
      description: "Create a zone on a map. Returns only the created zone with its generated id.",
      inputSchema: { mapId: uuid(), zone: zoneInputSchema },
    },
    handler(async ({ mapId, zone }) => {
      const created = await backend.request<Zone>(`/api/maps/${mapId}/zones`, {
        method: "POST",
        body: { zone },
      });
      return ok(created);
    })
  );

  server.registerTool(
    "update_zone",
    {
      title: "Update zone",
      description: "Partially update a zone by id. Returns only the updated zone.",
      inputSchema: { mapId: uuid(), zoneId: uuid(), patch: zonePatchSchema },
    },
    handler(async ({ mapId, zoneId, patch }) => {
      const updated = await backend.request<Zone>(`/api/maps/${mapId}/zones/${zoneId}`, {
        method: "PATCH",
        body: { patch },
      });
      return ok(updated);
    })
  );

  server.registerTool(
    "delete_zone",
    {
      title: "Delete zone",
      description:
        "Soft-delete a zone by id (works for default and user zones). Returns only the changed entity.",
      inputSchema: { mapId: uuid(), zoneId: uuid() },
    },
    handler(async ({ mapId, zoneId }) => {
      const deleted = await backend.request<Zone>(`/api/maps/${mapId}/zones/${zoneId}`, {
        method: "DELETE",
      });
      return ok({
        id: deleted.id,
        isDeleted: deleted.isDeleted,
        deletedAt: deleted.deletedAt,
        deletedBy: deleted.deletedBy,
      });
    })
  );
}

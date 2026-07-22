import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BackendClient } from "./backendClient.js";
import { uuid, pinInputSchema, pinPatchSchema } from "./schemas.js";
import { ok, handler } from "./results.js";
import type { Pin } from "./types.js";

/** Register pin CRUD tools (C1, C2, C3). */
export function registerPinTools(server: McpServer, backend: BackendClient): void {
  server.registerTool(
    "list_pins",
    {
      title: "List pins",
      description:
        "List pins for a map with stable ids. Excludes soft-deleted pins unless includeDeleted is true.",
      inputSchema: { mapId: uuid(), includeDeleted: z.boolean().optional() },
    },
    handler(async ({ mapId, includeDeleted }) => {
      const pins = await backend.request<Pin[]>(`/api/maps/${mapId}/pins`, {
        query: { includeDeleted: includeDeleted ? "true" : undefined },
      });
      return ok({ pins });
    })
  );

  server.registerTool(
    "create_pin",
    {
      title: "Create pin",
      description: "Create a pin on a map. Returns only the created pin with its generated id.",
      inputSchema: { mapId: uuid(), pin: pinInputSchema },
    },
    handler(async ({ mapId, pin }) => {
      const created = await backend.request<Pin>(`/api/maps/${mapId}/pins`, {
        method: "POST",
        body: { pin },
      });
      return ok(created);
    })
  );

  server.registerTool(
    "update_pin",
    {
      title: "Update pin",
      description: "Partially update a pin by id. Returns only the updated pin.",
      inputSchema: { mapId: uuid(), pinId: uuid(), patch: pinPatchSchema },
    },
    handler(async ({ mapId, pinId, patch }) => {
      const updated = await backend.request<Pin>(`/api/maps/${mapId}/pins/${pinId}`, {
        method: "PATCH",
        body: { patch },
      });
      return ok(updated);
    })
  );

  server.registerTool(
    "delete_pin",
    {
      title: "Delete pin",
      description:
        "Soft-delete a pin by id (works for default and user pins). Returns only the changed entity.",
      inputSchema: { mapId: uuid(), pinId: uuid() },
    },
    handler(async ({ mapId, pinId }) => {
      const deleted = await backend.request<Pin>(`/api/maps/${mapId}/pins/${pinId}`, {
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

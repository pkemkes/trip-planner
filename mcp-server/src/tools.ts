import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { BackendClient, McpToolError } from "./backendClient.js";

// ---------------------------------------------------------------------------
// Backend response shapes
// ---------------------------------------------------------------------------

interface MapListItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface EntityMetadata {
  id: string;
  source: "default" | "user";
  isDeleted: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
}

interface Pin extends EntityMetadata {
  name: string;
  category: string;
  lat: number;
  lng: number;
  description: string;
  whyVisit: string;
  links: { text: string; url: string }[];
}

interface Zone extends EntityMetadata {
  name: string;
  category: string;
  coords: [number, number][];
  description: string;
  whyVisit: string;
  links: { text: string; url: string }[];
}

interface MapState {
  id: string;
  name: string;
  userAddedMarkers: Pin[];
  userAddedZones: Zone[];
  removedBuiltinMarkerNames: string[];
  removedBuiltinZoneNames: string[];
}

// ---------------------------------------------------------------------------
// Shared zod fragments
// ---------------------------------------------------------------------------

const PIN_CATEGORIES = ["Town", "Village", "Hike", "Pub", "Garden", "Historic", "Castle"] as const;
const ZONE_CATEGORIES = ["National Park", "Scenic Area"] as const;

const uuid = z.string().uuid();
const linkSchema = z.object({ text: z.string().min(1), url: z.string().url() });

const pinInputSchema = z.object({
  name: z.string().min(1),
  category: z.enum(PIN_CATEGORIES),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  description: z.string().min(1),
  whyVisit: z.string().min(1),
  links: z.array(linkSchema).default([]),
});

const pinPatchSchema = z
  .object({
    name: z.string().min(1),
    category: z.enum(PIN_CATEGORIES),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    description: z.string().min(1),
    whyVisit: z.string().min(1),
    links: z.array(linkSchema),
  })
  .partial();

const zoneInputSchema = z.object({
  name: z.string().min(1),
  category: z.enum(ZONE_CATEGORIES),
  coords: z.array(z.tuple([z.number(), z.number()])).min(3),
  description: z.string().min(1),
  whyVisit: z.string().min(1),
  links: z.array(linkSchema).default([]),
});

const zonePatchSchema = z
  .object({
    name: z.string().min(1),
    category: z.enum(ZONE_CATEGORIES),
    coords: z.array(z.tuple([z.number(), z.number()])).min(3),
    description: z.string().min(1),
    whyVisit: z.string().min(1),
    links: z.array(linkSchema),
  })
  .partial();

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown): CallToolResult {
  const payload =
    error instanceof McpToolError
      ? error.toPayload()
      : {
          error: {
            code: "BACKEND_UNAVAILABLE",
            message: error instanceof Error ? error.message : String(error),
            details: {},
          },
        };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

/** Wrap a tool handler so thrown errors become structured tool errors. */
function handler<A>(fn: (args: A) => Promise<CallToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return await fn(args);
    } catch (err) {
      return fail(err);
    }
  };
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerTools(server: McpServer, backend: BackendClient): void {
  // --- Map discovery and selection (B2, B3, B4) ---

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

  // --- Pin tools (C1, C2, C3) ---

  server.registerTool(
    "list_pins",
    {
      title: "List pins",
      description:
        "List pins for a map with stable ids. Excludes soft-deleted pins unless includeDeleted is true.",
      inputSchema: { mapId: uuid, includeDeleted: z.boolean().optional() },
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
      inputSchema: { mapId: uuid, pin: pinInputSchema },
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
      inputSchema: { mapId: uuid, pinId: uuid, patch: pinPatchSchema },
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
      inputSchema: { mapId: uuid, pinId: uuid },
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

  // --- Zone tools (C4, C5, C6) ---

  server.registerTool(
    "list_zones",
    {
      title: "List zones",
      description:
        "List zones for a map with stable ids. Excludes soft-deleted zones unless includeDeleted is true.",
      inputSchema: { mapId: uuid, includeDeleted: z.boolean().optional() },
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
      inputSchema: { mapId: uuid, zone: zoneInputSchema },
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
      inputSchema: { mapId: uuid, zoneId: uuid, patch: zonePatchSchema },
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
      inputSchema: { mapId: uuid, zoneId: uuid },
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

  // Note (C7): no delete_map tool is registered. Map deletion is intentionally
  // unreachable through the MCP surface.
}

/** Names of every tool registered above. Used for tests asserting C7. */
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

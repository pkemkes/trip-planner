import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { BackendClient } from "./backendClient.js";
import { registerTools } from "./tools.js";
// The MCP tools talk to the real REST backend, started in-process against an
// in-memory database (D3: integration against a local backend).
import { startTestServer, type TestServer } from "../../server/testHelpers.js";

const MISSING_UUID = "00000000-0000-4000-8000-000000000000";

const validPin = {
  name: "Conwy",
  category: "Town",
  lat: 53.28,
  lng: -3.83,
  description: "Medieval walled town.",
  whyVisit: "Castle and town walls.",
  links: [],
};

const validZone = {
  name: "Snowdonia",
  category: "National Park",
  coords: [
    [53.1, -4.1],
    [53.2, -4.0],
    [53.0, -3.9],
  ],
  description: "Mountain national park.",
  whyVisit: "Hiking and scenery.",
  links: [],
};

let backend: TestServer;
let client: Client;

before(async () => {
  backend = await startTestServer({ seed: false });

  const server = new McpServer({ name: "trip-planner-mcp-test", version: "1.0.0" });
  registerTools(server, new BackendClient({ baseUrl: backend.baseUrl }));

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

after(async () => {
  await client.close();
  await backend.close();
});

interface ToolCall<T> {
  isError: boolean;
  data: T;
}

/** Call a tool and parse the JSON text payload it returns. */
async function call<T = Record<string, unknown>>(
  name: string,
  args: Record<string, unknown>
): Promise<ToolCall<T>> {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const first = result.content[0];
  assert.equal(first.type, "text");
  const data = JSON.parse((first as { text: string }).text) as T;
  return { isError: result.isError === true, data };
}

async function newMap(name = "Trip"): Promise<string> {
  const res = await call<{ id: string }>("create_map", { name });
  assert.equal(res.isError, false);
  return res.data.id;
}

describe("D3: map tools", () => {
  it("list_maps returns id, name, updatedAt only", async () => {
    const id = await newMap("Listed");
    const res = await call<{ maps: { id: string; name: string; updatedAt: string }[] }>(
      "list_maps",
      {}
    );
    assert.equal(res.isError, false);
    const entry = res.data.maps.find((m) => m.id === id);
    assert.ok(entry);
    assert.deepEqual(Object.keys(entry!).sort(), ["id", "name", "updatedAt"]);
  });

  it("create_map returns only the new map record", async () => {
    const res = await call<{ id: string; name: string }>("create_map", { name: "Fresh" });
    assert.equal(res.isError, false);
    assert.deepEqual(Object.keys(res.data).sort(), ["id", "name"]);
    assert.equal(res.data.name, "Fresh");
  });

  it("get_map_summary returns active pin/zone counts", async () => {
    const mapId = await newMap();
    await call("create_pin", { mapId, pin: validPin });
    await call("create_zone", { mapId, zone: validZone });

    const res = await call<{ pinCount: number; zoneCount: number; name: string }>(
      "get_map_summary",
      { mapId }
    );
    assert.equal(res.isError, false);
    assert.equal(res.data.pinCount, 1);
    assert.equal(res.data.zoneCount, 1);
  });

  it("get_map_summary maps a missing map to MAP_NOT_FOUND", async () => {
    const res = await call<{ error: { code: string } }>("get_map_summary", { mapId: MISSING_UUID });
    assert.equal(res.isError, true);
    assert.equal(res.data.error.code, "MAP_NOT_FOUND");
  });
});

describe("D3: pin tools", () => {
  it("create_pin returns only the created pin", async () => {
    const mapId = await newMap();
    const res = await call<{ id: string; source: string; isDeleted: boolean }>("create_pin", {
      mapId,
      pin: validPin,
    });
    assert.equal(res.isError, false);
    assert.ok(res.data.id);
    assert.equal(res.data.source, "user");
    assert.equal(res.data.isDeleted, false);
  });

  it("list_pins excludes deleted by default and includes them on request", async () => {
    const mapId = await newMap();
    const created = await call<{ id: string }>("create_pin", { mapId, pin: validPin });
    await call("delete_pin", { mapId, pinId: created.data.id });

    const active = await call<{ pins: unknown[] }>("list_pins", { mapId });
    assert.equal(active.data.pins.length, 0);

    const all = await call<{ pins: unknown[] }>("list_pins", { mapId, includeDeleted: true });
    assert.equal(all.data.pins.length, 1);
  });

  it("update_pin returns only the updated pin", async () => {
    const mapId = await newMap();
    const created = await call<{ id: string }>("create_pin", { mapId, pin: validPin });
    const res = await call<{ name: string }>("update_pin", {
      mapId,
      pinId: created.data.id,
      patch: { name: "Conwy Old Town" },
    });
    assert.equal(res.isError, false);
    assert.equal(res.data.name, "Conwy Old Town");
  });

  it("delete_pin returns only the changed-entity soft-delete fields", async () => {
    const mapId = await newMap();
    const created = await call<{ id: string }>("create_pin", { mapId, pin: validPin });
    const res = await call<{ id: string; isDeleted: boolean; deletedAt: string }>("delete_pin", {
      mapId,
      pinId: created.data.id,
    });
    assert.equal(res.isError, false);
    assert.deepEqual(Object.keys(res.data).sort(), ["deletedAt", "deletedBy", "id", "isDeleted"]);
    assert.equal(res.data.isDeleted, true);
    assert.ok(res.data.deletedAt);
  });

  it("update_pin maps a missing pin to PIN_NOT_FOUND", async () => {
    const mapId = await newMap();
    const res = await call<{ error: { code: string } }>("update_pin", {
      mapId,
      pinId: MISSING_UUID,
      patch: { name: "x" },
    });
    assert.equal(res.isError, true);
    assert.equal(res.data.error.code, "PIN_NOT_FOUND");
  });

  it("update_pin maps a deleted pin to ENTITY_DELETED", async () => {
    const mapId = await newMap();
    const created = await call<{ id: string }>("create_pin", { mapId, pin: validPin });
    await call("delete_pin", { mapId, pinId: created.data.id });
    const res = await call<{ error: { code: string } }>("update_pin", {
      mapId,
      pinId: created.data.id,
      patch: { name: "x" },
    });
    assert.equal(res.isError, true);
    assert.equal(res.data.error.code, "ENTITY_DELETED");
  });
});

describe("D3: zone tools", () => {
  it("create, update, list, and delete a zone", async () => {
    const mapId = await newMap();
    const created = await call<{ id: string; source: string }>("create_zone", {
      mapId,
      zone: validZone,
    });
    assert.equal(created.data.source, "user");

    const updated = await call<{ name: string }>("update_zone", {
      mapId,
      zoneId: created.data.id,
      patch: { name: "Eryri National Park" },
    });
    assert.equal(updated.data.name, "Eryri National Park");

    const deleted = await call<{ id: string; isDeleted: boolean }>("delete_zone", {
      mapId,
      zoneId: created.data.id,
    });
    assert.deepEqual(Object.keys(deleted.data).sort(), [
      "deletedAt",
      "deletedBy",
      "id",
      "isDeleted",
    ]);

    const active = await call<{ zones: unknown[] }>("list_zones", { mapId });
    assert.equal(active.data.zones.length, 0);
  });

  it("list_zones maps a missing map to MAP_NOT_FOUND", async () => {
    const res = await call<{ error: { code: string } }>("list_zones", { mapId: MISSING_UUID });
    assert.equal(res.isError, true);
    assert.equal(res.data.error.code, "MAP_NOT_FOUND");
  });
});

describe("D3/C7: capability surface", () => {
  it("exposes 11 tools and no map-deletion tool", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.equal(names.length, 11);
    assert.ok(!names.includes("delete_map"));
  });
});

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, api, type TestServer } from "./testHelpers.js";

const MISSING_UUID = "00000000-0000-4000-8000-000000000000";

const validPin = {
  name: "Conwy",
  category: "Town",
  lat: 53.28,
  lng: -3.83,
  description: "Medieval walled town.",
  whyVisit: "Castle and town walls.",
  links: [{ text: "Cadw", url: "https://cadw.gov.wales" }],
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

interface Entity {
  id: string;
  source: string;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
  name: string;
}

interface MapState {
  id: string;
  name: string;
  version: number;
  userAddedMarkers: Entity[];
  userAddedZones: Entity[];
}

let server: TestServer;

before(async () => {
  // Seed so a default map (with default-sourced entities) exists for edit/delete
  // coverage of default entities.
  server = await startTestServer({ seed: true });
});

after(async () => {
  await server.close();
});

async function createMap(name = "Trip"): Promise<MapState> {
  const res = await api<MapState>(server.baseUrl, "/api/maps", { method: "POST", body: { name } });
  assert.equal(res.status, 201);
  return res.body;
}

describe("D2: map endpoints", () => {
  it("creates a map and returns a version", async () => {
    const map = await createMap("Wales");
    assert.ok(map.id);
    assert.equal(map.name, "Wales");
    assert.equal(typeof map.version, "number");
  });

  it("rejects an empty map name with VALIDATION_ERROR", async () => {
    const res = await api<{ error: { code: string } }>(server.baseUrl, "/api/maps", {
      method: "POST",
      body: { name: "  " },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });

  it("returns MAP_NOT_FOUND for an unknown map", async () => {
    const res = await api<{ error: { code: string } }>(server.baseUrl, `/api/maps/${MISSING_UUID}`);
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "MAP_NOT_FOUND");
  });

  it("returns VALIDATION_ERROR for a malformed map id", async () => {
    const res = await api<{ error: { code: string } }>(server.baseUrl, "/api/maps/not-a-uuid");
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });

  it("lists created maps", async () => {
    const map = await createMap("Listed");
    const res = await api<{ id: string }[]>(server.baseUrl, "/api/maps");
    assert.equal(res.status, 200);
    assert.ok(res.body.some((m) => m.id === map.id));
  });
});

describe("D2: pin lifecycle", () => {
  it("creates, lists, updates, and soft-deletes a user pin", async () => {
    const map = await createMap();

    // Create returns only the created pin.
    const created = await api<Entity>(server.baseUrl, `/api/maps/${map.id}/pins`, {
      method: "POST",
      body: { pin: validPin },
    });
    assert.equal(created.status, 201);
    assert.ok(created.body.id);
    assert.equal(created.body.source, "user");
    assert.equal(created.body.isDeleted, false);

    const pinId = created.body.id;

    // List excludes deleted by default and includes the new pin.
    const list = await api<Entity[]>(server.baseUrl, `/api/maps/${map.id}/pins`);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].id, pinId);

    // Whole-map read reflects the pin (A9 keeps active entities).
    const mapRead = await api<MapState>(server.baseUrl, `/api/maps/${map.id}`);
    assert.equal(mapRead.body.userAddedMarkers.length, 1);

    // Update returns only the changed entity.
    const updated = await api<Entity>(server.baseUrl, `/api/maps/${map.id}/pins/${pinId}`, {
      method: "PATCH",
      body: { patch: { name: "Conwy Old Town" } },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.name, "Conwy Old Town");

    // Soft delete returns the tombstoned entity.
    const deleted = await api<Entity>(server.baseUrl, `/api/maps/${map.id}/pins/${pinId}`, {
      method: "DELETE",
    });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.isDeleted, true);
    assert.ok(deleted.body.deletedAt);

    // Default list now excludes it; includeDeleted surfaces it.
    const active = await api<Entity[]>(server.baseUrl, `/api/maps/${map.id}/pins`);
    assert.equal(active.body.length, 0);
    const all = await api<Entity[]>(
      server.baseUrl,
      `/api/maps/${map.id}/pins?includeDeleted=true`
    );
    assert.equal(all.body.length, 1);
    assert.equal(all.body[0].isDeleted, true);

    // Whole-map read excludes the deleted pin (A9).
    const mapAfter = await api<MapState>(server.baseUrl, `/api/maps/${map.id}`);
    assert.equal(mapAfter.body.userAddedMarkers.length, 0);
  });

  it("returns PIN_NOT_FOUND for an unknown pin", async () => {
    const map = await createMap();
    const res = await api<{ error: { code: string } }>(
      server.baseUrl,
      `/api/maps/${map.id}/pins/${MISSING_UUID}`,
      { method: "PATCH", body: { patch: { name: "x" } } }
    );
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "PIN_NOT_FOUND");
  });

  it("returns ENTITY_DELETED when updating a soft-deleted pin", async () => {
    const map = await createMap();
    const created = await api<Entity>(server.baseUrl, `/api/maps/${map.id}/pins`, {
      method: "POST",
      body: { pin: validPin },
    });
    await api(server.baseUrl, `/api/maps/${map.id}/pins/${created.body.id}`, { method: "DELETE" });

    const res = await api<{ error: { code: string } }>(
      server.baseUrl,
      `/api/maps/${map.id}/pins/${created.body.id}`,
      { method: "PATCH", body: { patch: { name: "x" } } }
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, "ENTITY_DELETED");
  });

  it("is idempotent when re-deleting a pin", async () => {
    const map = await createMap();
    const created = await api<Entity>(server.baseUrl, `/api/maps/${map.id}/pins`, {
      method: "POST",
      body: { pin: validPin },
    });
    const first = await api<Entity>(server.baseUrl, `/api/maps/${map.id}/pins/${created.body.id}`, {
      method: "DELETE",
    });
    const second = await api<Entity>(
      server.baseUrl,
      `/api/maps/${map.id}/pins/${created.body.id}`,
      { method: "DELETE" }
    );
    assert.equal(second.status, 200);
    assert.equal(second.body.isDeleted, true);
    assert.equal(second.body.deletedAt, first.body.deletedAt);
  });

  it("rejects invalid pin input with VALIDATION_ERROR", async () => {
    const map = await createMap();
    const res = await api<{ error: { code: string; details: { field: string } } }>(
      server.baseUrl,
      `/api/maps/${map.id}/pins`,
      { method: "POST", body: { pin: { ...validPin, category: "Spaceport" } } }
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
    assert.equal(res.body.error.details.field, "category");
  });
});

describe("D2: zone lifecycle", () => {
  it("creates, updates, and soft-deletes a user zone", async () => {
    const map = await createMap();

    const created = await api<Entity>(server.baseUrl, `/api/maps/${map.id}/zones`, {
      method: "POST",
      body: { zone: validZone },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.source, "user");

    const zoneId = created.body.id;

    const updated = await api<Entity & { coords: [number, number][] }>(
      server.baseUrl,
      `/api/maps/${map.id}/zones/${zoneId}`,
      {
        method: "PATCH",
        body: { patch: { name: "Eryri National Park" } },
      }
    );
    assert.equal(updated.body.name, "Eryri National Park");

    const deleted = await api<Entity>(server.baseUrl, `/api/maps/${map.id}/zones/${zoneId}`, {
      method: "DELETE",
    });
    assert.equal(deleted.body.isDeleted, true);

    const active = await api<Entity[]>(server.baseUrl, `/api/maps/${map.id}/zones`);
    assert.equal(active.body.length, 0);
    const all = await api<Entity[]>(
      server.baseUrl,
      `/api/maps/${map.id}/zones?includeDeleted=true`
    );
    assert.equal(all.body.length, 1);
  });

  it("returns ZONE_NOT_FOUND for an unknown zone", async () => {
    const map = await createMap();
    const res = await api<{ error: { code: string } }>(
      server.baseUrl,
      `/api/maps/${map.id}/zones/${MISSING_UUID}`,
      { method: "DELETE" }
    );
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "ZONE_NOT_FOUND");
  });

  it("rejects a zone with fewer than 3 coords", async () => {
    const map = await createMap();
    const res = await api<{ error: { code: string } }>(server.baseUrl, `/api/maps/${map.id}/zones`, {
      method: "POST",
      body: {
        zone: {
          ...validZone,
          coords: [
            [53.1, -4.1],
            [53.2, -4.0],
          ],
        },
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });
});

describe("D2: default-sourced entities can be edited and soft-deleted", () => {
  it("updates and soft-deletes a seeded default pin", async () => {
    const maps = await api<{ id: string; name: string }[]>(server.baseUrl, "/api/maps");
    const seeded = maps.body.find((m) => m.name === "Wales Trip");
    assert.ok(seeded, "seeded default map should exist");

    // includeDeleted forces the backfill so default pins gain stable ids.
    const pins = await api<Entity[]>(
      server.baseUrl,
      `/api/maps/${seeded!.id}/pins?includeDeleted=true`
    );
    const defaultPin = pins.body.find((p) => p.source === "default");
    assert.ok(defaultPin, "at least one default pin should exist");

    const updated = await api<Entity>(
      server.baseUrl,
      `/api/maps/${seeded!.id}/pins/${defaultPin!.id}`,
      { method: "PATCH", body: { patch: { description: "Updated default." } } }
    );
    assert.equal(updated.status, 200);

    const deleted = await api<Entity>(
      server.baseUrl,
      `/api/maps/${seeded!.id}/pins/${defaultPin!.id}`,
      { method: "DELETE" }
    );
    assert.equal(deleted.body.isDeleted, true);
  });

  it("updates and soft-deletes a seeded default zone", async () => {
    const maps = await api<{ id: string; name: string }[]>(server.baseUrl, "/api/maps");
    const seeded = maps.body.find((m) => m.name === "Wales Trip");
    assert.ok(seeded, "seeded default map should exist");

    // includeDeleted forces the backfill so default zones gain stable ids.
    const zones = await api<Entity[]>(
      server.baseUrl,
      `/api/maps/${seeded!.id}/zones?includeDeleted=true`
    );
    const defaultZone = zones.body.find((z) => z.source === "default");
    assert.ok(defaultZone, "at least one default zone should exist");

    const updated = await api<Entity>(
      server.baseUrl,
      `/api/maps/${seeded!.id}/zones/${defaultZone!.id}`,
      { method: "PATCH", body: { patch: { description: "Updated default." } } }
    );
    assert.equal(updated.status, 200);

    const deleted = await api<Entity>(
      server.baseUrl,
      `/api/maps/${seeded!.id}/zones/${defaultZone!.id}`,
      { method: "DELETE" }
    );
    assert.equal(deleted.body.isDeleted, true);
  });
});

describe("A9: whole-map save cannot resurrect a soft-deleted entity", () => {
  it("keeps a deleted pin gone after a frontend PUT that omits it", async () => {
    const map = await createMap();
    const created = await api<Entity>(server.baseUrl, `/api/maps/${map.id}/pins`, {
      method: "POST",
      body: { pin: validPin },
    });
    await api(server.baseUrl, `/api/maps/${map.id}/pins/${created.body.id}`, { method: "DELETE" });

    // Frontend saves the map with the (already filtered) active markers only.
    await api(server.baseUrl, `/api/maps/${map.id}`, {
      method: "PUT",
      body: { userAddedMarkers: [] },
    });

    // Not resurrected in the whole-map read.
    const mapRead = await api<MapState>(server.baseUrl, `/api/maps/${map.id}`);
    assert.equal(mapRead.body.userAddedMarkers.length, 0);

    // Tombstone preserved in storage.
    const all = await api<Entity[]>(
      server.baseUrl,
      `/api/maps/${map.id}/pins?includeDeleted=true`
    );
    assert.equal(all.body.length, 1);
    assert.equal(all.body[0].isDeleted, true);
  });
});

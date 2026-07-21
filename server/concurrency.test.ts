import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, api, type TestServer } from "./testHelpers.js";

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

interface Entity {
  id: string;
}

interface MapState {
  id: string;
  version: number;
}

let server: TestServer;

before(async () => {
  server = await startTestServer({ seed: false });
});

after(async () => {
  await server.close();
});

async function createMapWithPin(): Promise<{ mapId: string; pinId: string }> {
  const map = await api<MapState>(server.baseUrl, "/api/maps", {
    method: "POST",
    body: { name: "Concurrency" },
  });
  const pin = await api<Entity>(server.baseUrl, `/api/maps/${map.body.id}/pins`, {
    method: "POST",
    body: { pin: validPin },
  });
  return { mapId: map.body.id, pinId: pin.body.id };
}

async function createMapWithZone(): Promise<{ mapId: string; zoneId: string }> {
  const map = await api<MapState>(server.baseUrl, "/api/maps", {
    method: "POST",
    body: { name: "Concurrency" },
  });
  const zone = await api<Entity>(server.baseUrl, `/api/maps/${map.body.id}/zones`, {
    method: "POST",
    body: { zone: validZone },
  });
  return { mapId: map.body.id, zoneId: zone.body.id };
}

async function readVersion(mapId: string): Promise<number> {
  const res = await api<MapState>(server.baseUrl, `/api/maps/${mapId}`);
  return res.body.version;
}

describe("D4: optimistic concurrency (A7)", () => {
  it("rejects a stale pin update with CONFLICT and allows a fresh retry", async () => {
    const { mapId, pinId } = await createMapWithPin();
    const staleVersion = await readVersion(mapId);

    // First writer succeeds with the current version and bumps it.
    const first = await api<Entity>(server.baseUrl, `/api/maps/${mapId}/pins/${pinId}`, {
      method: "PATCH",
      body: { patch: { name: "First" }, expectedVersion: staleVersion },
    });
    assert.equal(first.status, 200);

    // Second writer using the now-stale version is rejected.
    const conflict = await api<{ error: { code: string } }>(
      server.baseUrl,
      `/api/maps/${mapId}/pins/${pinId}`,
      { method: "PATCH", body: { patch: { name: "Second" }, expectedVersion: staleVersion } }
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, "CONFLICT");

    // Re-read the fresh version and retry successfully.
    const freshVersion = await readVersion(mapId);
    assert.notEqual(freshVersion, staleVersion);
    const retry = await api<Entity>(server.baseUrl, `/api/maps/${mapId}/pins/${pinId}`, {
      method: "PATCH",
      body: { patch: { name: "Second" }, expectedVersion: freshVersion },
    });
    assert.equal(retry.status, 200);
  });

  it("rejects a stale delete with CONFLICT", async () => {
    const { mapId, pinId } = await createMapWithPin();
    const version = await readVersion(mapId);

    // Bump the version via an unrelated write so the captured version is stale.
    await api(server.baseUrl, `/api/maps/${mapId}/pins`, {
      method: "POST",
      body: { pin: validPin },
    });

    const conflict = await api<{ error: { code: string } }>(
      server.baseUrl,
      `/api/maps/${mapId}/pins/${pinId}?expectedVersion=${version}`,
      { method: "DELETE" }
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, "CONFLICT");
  });

  it("performs the write when no version is supplied (backward compatible)", async () => {
    const { mapId, pinId } = await createMapWithPin();
    const res = await api<Entity>(server.baseUrl, `/api/maps/${mapId}/pins/${pinId}`, {
      method: "PATCH",
      body: { patch: { name: "No version" } },
    });
    assert.equal(res.status, 200);
  });

  it("rejects a non-integer version with VALIDATION_ERROR", async () => {
    const { mapId, pinId } = await createMapWithPin();
    const res = await api<{ error: { code: string } }>(
      server.baseUrl,
      `/api/maps/${mapId}/pins/${pinId}`,
      { method: "PATCH", body: { patch: { name: "x" }, expectedVersion: "abc" } }
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });

  it("rejects a stale zone update with CONFLICT and allows a fresh retry", async () => {
    const { mapId, zoneId } = await createMapWithZone();
    const staleVersion = await readVersion(mapId);

    // First writer succeeds with the current version and bumps it.
    const first = await api<Entity>(server.baseUrl, `/api/maps/${mapId}/zones/${zoneId}`, {
      method: "PATCH",
      body: { patch: { name: "First" }, expectedVersion: staleVersion },
    });
    assert.equal(first.status, 200);

    // Second writer using the now-stale version is rejected.
    const conflict = await api<{ error: { code: string } }>(
      server.baseUrl,
      `/api/maps/${mapId}/zones/${zoneId}`,
      { method: "PATCH", body: { patch: { name: "Second" }, expectedVersion: staleVersion } }
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, "CONFLICT");

    // Re-read the fresh version and retry successfully.
    const freshVersion = await readVersion(mapId);
    assert.notEqual(freshVersion, staleVersion);
    const retry = await api<Entity>(server.baseUrl, `/api/maps/${mapId}/zones/${zoneId}`, {
      method: "PATCH",
      body: { patch: { name: "Second" }, expectedVersion: freshVersion },
    });
    assert.equal(retry.status, 200);
  });

  it("rejects a stale zone delete with CONFLICT", async () => {
    const { mapId, zoneId } = await createMapWithZone();
    const version = await readVersion(mapId);

    // Bump the version via an unrelated write so the captured version is stale.
    await api(server.baseUrl, `/api/maps/${mapId}/zones`, {
      method: "POST",
      body: { zone: validZone },
    });

    const conflict = await api<{ error: { code: string } }>(
      server.baseUrl,
      `/api/maps/${mapId}/zones/${zoneId}?expectedVersion=${version}`,
      { method: "DELETE" }
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, "CONFLICT");
  });
});

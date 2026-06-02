import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  applyPinPatch,
  applyZonePatch,
  buildPin,
  buildZone,
  filterActive,
  findById,
  isValidUuid,
  migrateEntities,
  softDelete,
  validateMapName,
  type Pin,
  type Zone,
} from "./entities.js";

const validPinInput = {
  name: "Conwy",
  category: "Town",
  lat: 53.28,
  lng: -3.83,
  description: "Medieval walled town.",
  whyVisit: "Castle and town walls.",
  links: [{ text: "Cadw", url: "https://cadw.gov.wales" }],
};

const validZoneInput = {
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

function expectApiError(fn: () => unknown, code: string, field?: string): void {
  try {
    fn();
    assert.fail("expected ApiError to be thrown");
  } catch (err) {
    assert.ok(err instanceof ApiError, "error should be an ApiError");
    assert.equal(err.code, code);
    if (field) assert.equal(err.details.field, field);
  }
}

describe("validateMapName", () => {
  it("accepts and trims a non-empty name", () => {
    assert.equal(validateMapName("  Wales Trip  "), "Wales Trip");
  });

  it("rejects empty or whitespace names", () => {
    expectApiError(() => validateMapName(""), "VALIDATION_ERROR", "name");
    expectApiError(() => validateMapName("   "), "VALIDATION_ERROR", "name");
  });

  it("rejects non-string names", () => {
    expectApiError(() => validateMapName(42), "VALIDATION_ERROR", "name");
    expectApiError(() => validateMapName(undefined), "VALIDATION_ERROR", "name");
  });
});

describe("buildPin", () => {
  it("creates a pin with UUID id, source, and soft-delete metadata", () => {
    const pin = buildPin(validPinInput, "user");
    assert.ok(isValidUuid(pin.id));
    assert.equal(pin.source, "user");
    assert.equal(pin.isDeleted, false);
    assert.equal(pin.deletedAt, null);
    assert.equal(pin.deletedBy, null);
    assert.equal(pin.name, "Conwy");
  });

  it("tags source default when requested", () => {
    assert.equal(buildPin(validPinInput, "default").source, "default");
  });

  it("rejects invalid category", () => {
    expectApiError(() => buildPin({ ...validPinInput, category: "Spaceport" }), "VALIDATION_ERROR", "category");
  });

  it("rejects out-of-range latitude", () => {
    expectApiError(() => buildPin({ ...validPinInput, lat: 91 }), "VALIDATION_ERROR", "lat");
  });

  it("rejects out-of-range longitude", () => {
    expectApiError(() => buildPin({ ...validPinInput, lng: -181 }), "VALIDATION_ERROR", "lng");
  });

  it("rejects empty required text fields", () => {
    expectApiError(() => buildPin({ ...validPinInput, name: "" }), "VALIDATION_ERROR", "name");
    expectApiError(() => buildPin({ ...validPinInput, description: "  " }), "VALIDATION_ERROR", "description");
    expectApiError(() => buildPin({ ...validPinInput, whyVisit: "" }), "VALIDATION_ERROR", "whyVisit");
  });

  it("rejects links with invalid URLs", () => {
    expectApiError(
      () => buildPin({ ...validPinInput, links: [{ text: "bad", url: "not-a-url" }] }),
      "VALIDATION_ERROR"
    );
  });

  it("defaults links to an empty array when omitted", () => {
    const { links, ...rest } = validPinInput;
    void links;
    assert.deepEqual(buildPin(rest).links, []);
  });
});

describe("buildZone", () => {
  it("creates a zone with metadata", () => {
    const zone = buildZone(validZoneInput, "user");
    assert.ok(isValidUuid(zone.id));
    assert.equal(zone.source, "user");
    assert.equal(zone.isDeleted, false);
    assert.equal(zone.coords.length, 3);
  });

  it("rejects fewer than 3 coordinates", () => {
    expectApiError(
      () => buildZone({ ...validZoneInput, coords: [[53.1, -4.1], [53.2, -4.0]] }),
      "VALIDATION_ERROR",
      "coords"
    );
  });

  it("rejects invalid zone category", () => {
    expectApiError(() => buildZone({ ...validZoneInput, category: "Town" }), "VALIDATION_ERROR", "category");
  });

  it("rejects malformed coordinate pairs", () => {
    expectApiError(
      () => buildZone({ ...validZoneInput, coords: [[53.1, -4.1], [53.2, -4.0], [53.0]] }),
      "VALIDATION_ERROR"
    );
  });
});

describe("applyPinPatch", () => {
  const base = buildPin(validPinInput, "default");

  it("updates only provided fields", () => {
    const updated = applyPinPatch(base, { name: "Conwy Old Town" });
    assert.equal(updated.name, "Conwy Old Town");
    assert.equal(updated.lat, base.lat);
    assert.equal(updated.id, base.id);
    assert.equal(updated.source, "default");
  });

  it("validates patched coordinates", () => {
    expectApiError(() => applyPinPatch(base, { lat: 200 }), "VALIDATION_ERROR", "lat");
  });

  it("validates patched category", () => {
    expectApiError(() => applyPinPatch(base, { category: "Nope" }), "VALIDATION_ERROR", "category");
  });
});

describe("applyZonePatch", () => {
  const base = buildZone(validZoneInput, "default");

  it("updates coords when valid", () => {
    const updated = applyZonePatch(base, {
      coords: [
        [53.1, -4.1],
        [53.2, -4.0],
        [53.0, -3.9],
        [53.05, -4.2],
      ],
    });
    assert.equal(updated.coords.length, 4);
  });

  it("rejects too-few coords on patch", () => {
    expectApiError(() => applyZonePatch(base, { coords: [[1, 1]] }), "VALIDATION_ERROR", "coords");
  });
});

describe("softDelete", () => {
  it("marks an entity deleted with timestamp", () => {
    const pin = buildPin(validPinInput);
    const deleted = softDelete(pin);
    assert.equal(deleted.isDeleted, true);
    assert.ok(deleted.deletedAt && !Number.isNaN(Date.parse(deleted.deletedAt)));
    assert.equal(deleted.deletedBy, null);
    assert.equal(deleted.id, pin.id);
  });

  it("works on default-sourced entities", () => {
    const zone = buildZone(validZoneInput, "default");
    assert.equal(softDelete(zone).isDeleted, true);
  });
});

describe("migrateEntities (backfill)", () => {
  const defaultNames = new Set(["Conwy"]);

  it("backfills missing id and metadata and reports changed", () => {
    const result = migrateEntities<Pin>(
      [{ name: "Conwy", category: "Town", lat: 53.28, lng: -3.83 }],
      defaultNames
    );
    assert.equal(result.changed, true);
    const [entity] = result.entities;
    assert.ok(isValidUuid(entity.id));
    assert.equal(entity.source, "default");
    assert.equal(entity.isDeleted, false);
    assert.equal(entity.deletedAt, null);
    assert.equal(entity.deletedBy, null);
  });

  it("tags unknown names as user source", () => {
    const result = migrateEntities<Pin>([{ name: "Custom Spot" }], defaultNames);
    assert.equal(result.entities[0].source, "user");
  });

  it("is idempotent for already-migrated entities", () => {
    const first = migrateEntities<Pin>([{ name: "Conwy" }], defaultNames);
    const second = migrateEntities<Pin>(first.entities, defaultNames);
    assert.equal(second.changed, false);
    assert.deepEqual(second.entities, first.entities);
  });

  it("handles non-array input safely", () => {
    const result = migrateEntities<Pin>(null, defaultNames);
    assert.deepEqual(result.entities, []);
    assert.equal(result.changed, false);
  });
});

describe("filterActive and findById", () => {
  const active = buildPin(validPinInput);
  const deleted = softDelete(buildPin(validPinInput));
  const list: Pin[] = [active, deleted];

  it("excludes deleted entities by default", () => {
    assert.deepEqual(filterActive(list, false), [active]);
  });

  it("includes deleted entities when requested", () => {
    assert.equal(filterActive(list, true).length, 2);
  });

  it("finds entities by id", () => {
    assert.equal(findById(list, deleted.id), deleted);
    assert.equal(findById(list, "missing"), undefined);
  });
});

describe("isValidUuid", () => {
  it("accepts a v4 UUID", () => {
    assert.equal(isValidUuid("3f9a1c2e-4b6d-4e8f-9a1b-2c3d4e5f6a7b"), true);
  });

  it("rejects non-UUID strings", () => {
    assert.equal(isValidUuid("not-a-uuid"), false);
    assert.equal(isValidUuid(123 as unknown), false);
  });
});

// Type-only references to keep Zone import used in strict builds.
const _zoneType: Zone | null = null;
void _zoneType;

import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const PIN_CATEGORIES = [
  "Stop",
  "Town",
  "Village",
  "Hike",
  "Pub",
  "Garden",
  "Historic",
  "Castle",
] as const;

export const ZONE_CATEGORIES = ["National Park", "Scenic Area"] as const;

export type PinCategory = (typeof PIN_CATEGORIES)[number];
export type ZoneCategory = (typeof ZONE_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Entity shapes
// ---------------------------------------------------------------------------

export type EntitySource = "default" | "user";

export interface EntityLink {
  text: string;
  url: string;
}

export interface EntityMetadata {
  id: string;
  source: EntitySource;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
}

export interface Pin extends EntityMetadata {
  name: string;
  category: string;
  lat: number;
  lng: number;
  description: string;
  whyVisit: string;
  links: EntityLink[];
}

export interface Zone extends EntityMetadata {
  name: string;
  category: string;
  coords: [number, number][];
  description: string;
  whyVisit: string;
  links: EntityLink[];
}

// ---------------------------------------------------------------------------
// Error contract
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "MAP_NOT_FOUND"
  | "PIN_NOT_FOUND"
  | "ZONE_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "ENTITY_DELETED"
  | "BACKEND_UNAVAILABLE";

const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  MAP_NOT_FOUND: 404,
  PIN_NOT_FOUND: 404,
  ZONE_NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  ENTITY_DELETED: 409,
  BACKEND_UNAVAILABLE: 503,
};

export class ApiError extends Error {
  code: ErrorCode;
  details: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }

  get httpStatus(): number {
    return HTTP_STATUS_BY_CODE[this.code];
  }

  toPayload(): { error: { code: ErrorCode; message: string; details: Record<string, unknown> } } {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

export function assertValidUuid(value: unknown, field: string): asserts value is string {
  if (!isValidUuid(value)) {
    throw new ApiError("VALIDATION_ERROR", `${field} must be a valid UUID`, { field });
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateMapName(name: unknown): string {
  if (!isNonEmptyString(name)) {
    throw new ApiError("VALIDATION_ERROR", "Map name is required and must be non-empty", {
      field: "name",
    });
  }
  return name.trim();
}

function isValidAbsoluteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateLinks(links: unknown): EntityLink[] {
  if (links === undefined || links === null) return [];
  if (!Array.isArray(links)) {
    throw new ApiError("VALIDATION_ERROR", "links must be an array", { field: "links" });
  }
  return links.map((link, index) => {
    if (typeof link !== "object" || link === null) {
      throw new ApiError("VALIDATION_ERROR", "each link must be an object", {
        field: `links[${index}]`,
      });
    }
    const { text, url } = link as Record<string, unknown>;
    if (!isNonEmptyString(text)) {
      throw new ApiError("VALIDATION_ERROR", "link text must be a non-empty string", {
        field: `links[${index}].text`,
      });
    }
    if (typeof url !== "string" || !isValidAbsoluteUrl(url)) {
      throw new ApiError("VALIDATION_ERROR", "link url must be a valid absolute URL", {
        field: `links[${index}].url`,
      });
    }
    return { text: text.trim(), url };
  });
}

function validateLatLng(lat: unknown, lng: unknown): { lat: number; lng: number } {
  if (typeof lat !== "number" || Number.isNaN(lat) || lat < -90 || lat > 90) {
    throw new ApiError("VALIDATION_ERROR", "lat must be a number between -90 and 90", {
      field: "lat",
    });
  }
  if (typeof lng !== "number" || Number.isNaN(lng) || lng < -180 || lng > 180) {
    throw new ApiError("VALIDATION_ERROR", "lng must be a number between -180 and 180", {
      field: "lng",
    });
  }
  return { lat, lng };
}

function validateCoords(coords: unknown): [number, number][] {
  if (!Array.isArray(coords) || coords.length < 3) {
    throw new ApiError("VALIDATION_ERROR", "coords must contain at least 3 vertices", {
      field: "coords",
    });
  }
  return coords.map((point, index) => {
    if (!Array.isArray(point) || point.length !== 2) {
      throw new ApiError("VALIDATION_ERROR", "each coord must be a [lat, lng] pair", {
        field: `coords[${index}]`,
      });
    }
    const { lat, lng } = validateLatLng(point[0], point[1]);
    return [lat, lng] as [number, number];
  });
}

function validatePinCategory(category: unknown): PinCategory {
  if (typeof category !== "string" || !PIN_CATEGORIES.includes(category as PinCategory)) {
    throw new ApiError("VALIDATION_ERROR", `category must be one of: ${PIN_CATEGORIES.join(", ")}`, {
      field: "category",
    });
  }
  return category as PinCategory;
}

function validateZoneCategory(category: unknown): ZoneCategory {
  if (typeof category !== "string" || !ZONE_CATEGORIES.includes(category as ZoneCategory)) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `category must be one of: ${ZONE_CATEGORIES.join(", ")}`,
      { field: "category" }
    );
  }
  return category as ZoneCategory;
}

function validateRequiredText(value: unknown, field: string): string {
  if (!isNonEmptyString(value)) {
    throw new ApiError("VALIDATION_ERROR", `${field} must be a non-empty string`, { field });
  }
  return value;
}

// ---------------------------------------------------------------------------
// Create / patch builders
// ---------------------------------------------------------------------------

function freshMetadata(source: EntitySource): EntityMetadata {
  return {
    id: uuidv4(),
    source,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
  };
}

export function buildPin(input: unknown, source: EntitySource = "user"): Pin {
  if (typeof input !== "object" || input === null) {
    throw new ApiError("VALIDATION_ERROR", "pin must be an object", { field: "pin" });
  }
  const data = input as Record<string, unknown>;
  const { lat, lng } = validateLatLng(data.lat, data.lng);
  return {
    ...freshMetadata(source),
    name: validateRequiredText(data.name, "name"),
    category: validatePinCategory(data.category),
    lat,
    lng,
    description: validateRequiredText(data.description, "description"),
    whyVisit: validateRequiredText(data.whyVisit, "whyVisit"),
    links: validateLinks(data.links),
  };
}

export function buildZone(input: unknown, source: EntitySource = "user"): Zone {
  if (typeof input !== "object" || input === null) {
    throw new ApiError("VALIDATION_ERROR", "zone must be an object", { field: "zone" });
  }
  const data = input as Record<string, unknown>;
  return {
    ...freshMetadata(source),
    name: validateRequiredText(data.name, "name"),
    category: validateZoneCategory(data.category),
    coords: validateCoords(data.coords),
    description: validateRequiredText(data.description, "description"),
    whyVisit: validateRequiredText(data.whyVisit, "whyVisit"),
    links: validateLinks(data.links),
  };
}

export function applyPinPatch(pin: Pin, patch: unknown): Pin {
  if (typeof patch !== "object" || patch === null) {
    throw new ApiError("VALIDATION_ERROR", "patch must be an object", { field: "patch" });
  }
  const data = patch as Record<string, unknown>;
  const next: Pin = { ...pin };

  if ("name" in data) next.name = validateRequiredText(data.name, "name");
  if ("category" in data) next.category = validatePinCategory(data.category);
  if ("lat" in data || "lng" in data) {
    const { lat, lng } = validateLatLng(
      "lat" in data ? data.lat : pin.lat,
      "lng" in data ? data.lng : pin.lng
    );
    next.lat = lat;
    next.lng = lng;
  }
  if ("description" in data) next.description = validateRequiredText(data.description, "description");
  if ("whyVisit" in data) next.whyVisit = validateRequiredText(data.whyVisit, "whyVisit");
  if ("links" in data) next.links = validateLinks(data.links);

  return next;
}

export function applyZonePatch(zone: Zone, patch: unknown): Zone {
  if (typeof patch !== "object" || patch === null) {
    throw new ApiError("VALIDATION_ERROR", "patch must be an object", { field: "patch" });
  }
  const data = patch as Record<string, unknown>;
  const next: Zone = { ...zone };

  if ("name" in data) next.name = validateRequiredText(data.name, "name");
  if ("category" in data) next.category = validateZoneCategory(data.category);
  if ("coords" in data) next.coords = validateCoords(data.coords);
  if ("description" in data) next.description = validateRequiredText(data.description, "description");
  if ("whyVisit" in data) next.whyVisit = validateRequiredText(data.whyVisit, "whyVisit");
  if ("links" in data) next.links = validateLinks(data.links);

  return next;
}

export function softDelete<T extends EntityMetadata>(entity: T, deletedBy: string | null = null): T {
  return {
    ...entity,
    isDeleted: true,
    deletedAt: new Date().toISOString(),
    deletedBy,
  };
}

// ---------------------------------------------------------------------------
// Migration / backfill (A1, A2)
// ---------------------------------------------------------------------------

/**
 * Ensure a stored entity carries stable id and soft-delete metadata. Returns a
 * tuple of the upgraded entity and whether any backfill was applied so callers
 * can persist idempotently (only writing when something actually changed).
 */
function ensureEntityMetadata(
  raw: Record<string, unknown>,
  defaultNames: Set<string>
): { entity: Record<string, unknown> & EntityMetadata; changed: boolean } {
  let changed = false;
  const entity = { ...raw } as Record<string, unknown> & EntityMetadata;

  if (!isValidUuid(entity.id)) {
    entity.id = uuidv4();
    changed = true;
  }
  if (entity.source !== "default" && entity.source !== "user") {
    const name = typeof raw.name === "string" ? raw.name : "";
    entity.source = defaultNames.has(name) ? "default" : "user";
    changed = true;
  }
  if (typeof entity.isDeleted !== "boolean") {
    entity.isDeleted = false;
    changed = true;
  }
  if (entity.deletedAt === undefined) {
    entity.deletedAt = null;
    changed = true;
  }
  if (entity.deletedBy === undefined) {
    entity.deletedBy = null;
    changed = true;
  }

  return { entity, changed };
}

export function migrateEntities<T extends EntityMetadata>(
  rawEntities: unknown,
  defaultNames: Set<string>
): { entities: T[]; changed: boolean } {
  const list = Array.isArray(rawEntities) ? rawEntities : [];
  let changed = false;
  const entities = list.map((raw) => {
    const result = ensureEntityMetadata(raw as Record<string, unknown>, defaultNames);
    if (result.changed) changed = true;
    return result.entity as unknown as T;
  });
  return { entities, changed };
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function filterActive<T extends EntityMetadata>(entities: T[], includeDeleted: boolean): T[] {
  return includeDeleted ? entities : entities.filter((e) => !e.isDeleted);
}

export function findById<T extends EntityMetadata>(entities: T[], id: string): T | undefined {
  return entities.find((e) => e.id === id);
}

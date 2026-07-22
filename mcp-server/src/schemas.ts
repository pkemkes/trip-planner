import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared zod fragments
// ---------------------------------------------------------------------------

export const PIN_CATEGORIES = [
  "Town",
  "Village",
  "Hike",
  "Pub",
  "Garden",
  "Historic",
  "Castle",
] as const;
export const ZONE_CATEGORIES = ["National Park", "Scenic Area"] as const;

export const uuid = z.string().uuid();
const linkSchema = z.object({ text: z.string().min(1), url: z.string().url() });

// Fields common to create (input) and patch schemas. The `links` field differs:
// on create it defaults to an empty array, on patch it must stay optional so an
// omitted value leaves existing links unchanged.
const pinFields = {
  name: z.string().min(1),
  category: z.enum(PIN_CATEGORIES),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  description: z.string().min(1),
  whyVisit: z.string().min(1),
};

export const pinInputSchema = z.object({
  ...pinFields,
  links: z.array(linkSchema).default([]),
});

export const pinPatchSchema = z
  .object({ ...pinFields, links: z.array(linkSchema) })
  .partial();

const zoneFields = {
  name: z.string().min(1),
  category: z.enum(ZONE_CATEGORIES),
  coords: z
    .array(z.array(z.number()).length(2))
    .min(3)
    .describe("Polygon vertices as [lat, lng] pairs; at least 3 required."),
  description: z.string().min(1),
  whyVisit: z.string().min(1),
};

export const zoneInputSchema = z.object({
  ...zoneFields,
  links: z.array(linkSchema).default([]),
});

export const zonePatchSchema = z
  .object({ ...zoneFields, links: z.array(linkSchema) })
  .partial();

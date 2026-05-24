import type { CategoryStyle, LocationCategory } from "../types/MapTypes";

export const CATEGORY_MARKER_STYLES: Record<LocationCategory, CategoryStyle> = {
  "National Park": { color: "green", icon: "park" },
  "Scenic Area": { color: "darkpurple", icon: "landscape" },
  Town: { color: "blue", icon: "location_city" },
  Village: { color: "cadetblue", icon: "cottage" },
  Hike: { color: "orange", icon: "hiking" },
  Pub: { color: "darkred", icon: "sports_bar" },
  Garden: { color: "purple", icon: "local_florist" },
  Historic: { color: "#5b396b", icon: "account_balance" },
  Castle: { color: "red", icon: "fort" },
};

export const CATEGORY_ZONE_COLORS: Record<LocationCategory, string> = {
  "National Park": "#228B22",
  "Scenic Area": "#1ea0a0",
  Town: "#38aadd",
  Village: "#436978",
  Hike: "#f69730",
  Pub: "#a23336",
  Garden: "#d252b9",
  Historic: "#5b396b",
  Castle: "#cb2b3e",
};

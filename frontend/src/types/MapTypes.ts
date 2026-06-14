export interface LocationLink {
  text: string;
  url: string;
}

export interface BaseLocation {
  name: string;
  category: LocationCategory;
  description: string;
  whyVisit: string;
  links: LocationLink[];
}

export interface MapLocation extends BaseLocation {
  lat: number;
  lng: number;
}

export interface AreaBoundary extends BaseLocation {
  coords: [number, number][];
}

export type LocationCategory =
  | "National Park"
  | "Scenic Area"
  | "Stop"
  | "Town"
  | "Village"
  | "Hike"
  | "Pub"
  | "Garden"
  | "Historic"
  | "Castle";

export interface CategoryStyle {
  color: string;
  icon: string;
}

export type EditingMode = "normal" | "add-marker" | "add-zone" | "remove";

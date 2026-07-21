// ---------------------------------------------------------------------------
// Backend response shapes
// ---------------------------------------------------------------------------

export interface MapListItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface EntityMetadata {
  id: string;
  source: "default" | "user";
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
  links: { text: string; url: string }[];
}

export interface Zone extends EntityMetadata {
  name: string;
  category: string;
  coords: [number, number][];
  description: string;
  whyVisit: string;
  links: { text: string; url: string }[];
}

export interface MapState {
  id: string;
  name: string;
  userAddedMarkers: Pin[];
  userAddedZones: Zone[];
  removedBuiltinMarkerNames: string[];
  removedBuiltinZoneNames: string[];
}

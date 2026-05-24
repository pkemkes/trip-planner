import { MapContainer, TileLayer, ZoomControl, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { AreaBoundary, EditingMode, MapLocation } from "../types/MapTypes";
import { LocationMarker, MapClickHandler } from "./LocationMarker";
import { ZoneDrawingPreview, ZonePolygon } from "./ZonePolygon";

const WALES_CENTER: [number, number] = [52.3, -3.8];
const DEFAULT_ZOOM = 7;

function CursorOverride({ editingMode }: { editingMode: EditingMode }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    if (editingMode === "add-marker" || editingMode === "add-zone") {
      container.style.cursor = "crosshair";
    } else if (editingMode === "remove") {
      container.style.cursor = "not-allowed";
    } else {
      container.style.cursor = "";
    }
    return () => {
      container.style.cursor = "";
    };
  }, [editingMode, map]);

  return null;
}

interface TripPlannerMapProps {
  visibleLocations: MapLocation[];
  visibleZones: AreaBoundary[];
  editingMode: EditingMode;
  zoneDrawingVertices: [number, number][];
  onMapClick: (latitude: number, longitude: number) => void;
  onRemoveLocation: (location: MapLocation) => void;
  onRemoveZone: (zone: AreaBoundary) => void;
}

export function TripPlannerMap({
  visibleLocations,
  visibleZones,
  editingMode,
  zoneDrawingVertices,
  onMapClick,
  onRemoveLocation,
  onRemoveZone,
}: TripPlannerMapProps) {
  return (
    <MapContainer
      center={WALES_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ width: "100%", height: "100%" }}
      zoomControl={false}
    >
      <ZoomControl position="bottomleft" />
      <CursorOverride editingMode={editingMode} />
      <TileLayer
        attribution='Data by &copy; <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://www.openstreetmap.org/copyright">ODbL</a>.'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxNativeZoom={18}
        maxZoom={18}
        minZoom={0}
        subdomains="abc"
      />

      <MapClickHandler editingMode={editingMode} onMapClick={onMapClick} />

      {visibleZones.map((zone) => (
        <ZonePolygon
          key={zone.name}
          zone={zone}
          editingMode={editingMode}
          onRemove={() => onRemoveZone(zone)}
        />
      ))}

      {visibleLocations.map((location) => (
        <LocationMarker
          key={`${location.name}-${location.lat}-${location.lng}`}
          location={location}
          editingMode={editingMode}
          onRemove={() => onRemoveLocation(location)}
        />
      ))}

      {editingMode === "add-zone" && zoneDrawingVertices.length > 0 && (
        <ZoneDrawingPreview vertices={zoneDrawingVertices} />
      )}
    </MapContainer>
  );
}

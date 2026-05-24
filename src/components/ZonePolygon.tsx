import { CircleMarker, Polygon, Polyline, Popup, Tooltip } from "react-leaflet";
import { useState } from "react";
import type { AreaBoundary, EditingMode } from "../types/MapTypes";
import type { LocationLink } from "../types/MapTypes";
import { CATEGORY_ZONE_COLORS } from "../data/categoryStyles";
import { ConfirmDialog } from "./ConfirmDialog";

interface ZonePolygonProps {
  zone: AreaBoundary;
  editingMode: EditingMode;
  onRemove: () => void;
}

function LinksSection({ links }: { links: LocationLink[] }) {
  if (links.length === 0) return null;
  return (
    <>
      <br /><br />
      <strong>Links:</strong>{" "}
      {links.map((link, i) => (
        <span key={link.url}>
          {i > 0 && " | "}
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {link.text}
          </a>
        </span>
      ))}
    </>
  );
}

function ZonePopupContent({ zone }: { zone: AreaBoundary }) {
  return (
    <div style={{ maxWidth: 300 }}>
      <strong>{zone.name}</strong><br />
      <em>{zone.category}</em><br /><br />
      <strong>Description:</strong> {zone.description}<br /><br />
      <strong>Why visit:</strong> {zone.whyVisit}
      <LinksSection links={zone.links} />
    </div>
  );
}

export function ZonePolygon({ zone, editingMode, onRemove }: ZonePolygonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const zoneColor = CATEGORY_ZONE_COLORS[zone.category];

  const handleZoneClick = () => {
    if (editingMode === "remove") {
      setConfirmOpen(true);
    }
  };

  return (
    <>
      <Polygon
        positions={zone.coords}
        pathOptions={{
          color: zoneColor,
          weight: 2,
          fillColor: zoneColor,
          fillOpacity: 0.2,
        }}
        eventHandlers={{ click: handleZoneClick }}
      >
        {editingMode !== "remove" && (
          <Popup maxWidth={320}>
            <ZonePopupContent zone={zone} />
          </Popup>
        )}
        <Tooltip sticky>{zone.name} ({zone.category})</Tooltip>
      </Polygon>
      <ConfirmDialog
        isOpen={confirmOpen}
        title="Remove Zone"
        message={`Are you sure you want to remove "${zone.name}"?`}
        onConfirm={() => {
          setConfirmOpen(false);
          onRemove();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

interface ZoneDrawingPreviewProps {
  vertices: [number, number][];
}

export function ZoneDrawingPreview({ vertices }: ZoneDrawingPreviewProps) {
  return (
    <>
      {vertices.map((vertex, index) => (
        <CircleMarker
          key={index}
          center={vertex}
          radius={6}
          pathOptions={{
            color: "#ff4444",
            fillColor: "#ff4444",
            fillOpacity: 0.8,
          }}
        />
      ))}
      {vertices.length > 1 && (
        <Polyline
          positions={vertices}
          pathOptions={{
            color: "#ff4444",
            dashArray: "5,5",
            weight: 2,
          }}
        />
      )}
    </>
  );
}

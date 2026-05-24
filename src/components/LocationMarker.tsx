import { Marker, Popup, Tooltip, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import { useState } from "react";
import type { EditingMode, MapLocation } from "../types/MapTypes";
import type { LocationLink } from "../types/MapTypes";
import { CATEGORY_MARKER_STYLES } from "../data/categoryStyles";
import { ConfirmDialog } from "./ConfirmDialog";

interface LocationMarkerProps {
  location: MapLocation;
  editingMode: EditingMode;
  onRemove: () => void;
}

function buildMarkerIcon(location: MapLocation): L.DivIcon {
  const style = CATEGORY_MARKER_STYLES[location.category] ?? {
    color: "blue",
    icon: "place",
  };

  const html = renderToStaticMarkup(
    <div
      style={{
        backgroundColor: style.color,
        width: 28,
        height: 28,
        borderRadius: "50% 50% 50% 0",
        transform: "rotate(-45deg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "2px solid white",
        boxShadow: "0 2px 5px rgba(0,0,0,0.3)",
      }}
    >
      <span
        className="material-icons"
        style={{ transform: "rotate(45deg)", color: "white", fontSize: 14 }}
      >
        {style.icon}
      </span>
    </div>
  );

  return L.divIcon({
    className: "custom-marker-icon",
    html,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
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

function PopupContent({ location }: { location: MapLocation }) {
  return (
    <div style={{ maxWidth: 300 }}>
      <strong>{location.name}</strong><br />
      <em>{location.category}</em><br /><br />
      <strong>Description:</strong> {location.description}<br /><br />
      <strong>Why visit:</strong> {location.whyVisit}
      <LinksSection links={location.links} />
    </div>
  );
}

export function LocationMarker({
  location,
  editingMode,
  onRemove,
}: LocationMarkerProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const markerIcon = buildMarkerIcon(location);

  const handleMarkerClick = () => {
    if (editingMode === "remove") {
      setConfirmOpen(true);
    }
  };

  return (
    <>
      <Marker
        position={[location.lat, location.lng]}
        icon={markerIcon}
        eventHandlers={{
          click: handleMarkerClick,
        }}
      >
        {editingMode !== "remove" && (
          <>
            <Popup maxWidth={320}>
              <PopupContent location={location} />
            </Popup>
            <Tooltip sticky>
              {location.name} ({location.category})
            </Tooltip>
          </>
        )}
      </Marker>
      <ConfirmDialog
        isOpen={confirmOpen}
        title="Remove Marker"
        message={`Are you sure you want to remove "${location.name}"?`}
        onConfirm={() => {
          setConfirmOpen(false);
          onRemove();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

interface MapClickHandlerProps {
  editingMode: EditingMode;
  onMapClick: (latitude: number, longitude: number) => void;
}

export function MapClickHandler({
  editingMode,
  onMapClick,
}: MapClickHandlerProps) {
  useMapEvents({
    click(event) {
      if (editingMode === "add-marker" || editingMode === "add-zone") {
        onMapClick(event.latlng.lat, event.latlng.lng);
      }
    },
  });
  return null;
}

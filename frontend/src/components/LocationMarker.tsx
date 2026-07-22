import { Marker, Popup, Tooltip, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import { useState } from "react";
import { Button } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import type { EditingMode, MapLocation } from "../types/MapTypes";
import type { LocationLink } from "../types/MapTypes";
import { CATEGORY_MARKER_STYLES } from "../data/categoryStyles";
import { ConfirmDialog } from "./ConfirmDialog";

interface LocationMarkerProps {
  location: MapLocation;
  editingMode: EditingMode;
  isMobile: boolean;
  isSelected: boolean;
  onRemove: () => void;
  onEdit: () => void;
  onSelect: () => void;
}

function buildMarkerIcon(location: MapLocation, highlighted: boolean): L.DivIcon {
  const style = CATEGORY_MARKER_STYLES[location.category] ?? {
    color: "blue",
    icon: "place",
  };

  const size = highlighted ? 38 : 28;
  const iconFontSize = highlighted ? 20 : 14;

  const html = renderToStaticMarkup(
    <div
      style={{
        backgroundColor: style.color,
        width: size,
        height: size,
        borderRadius: "50% 50% 50% 0",
        transform: "rotate(-45deg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: highlighted ? "3px solid #1976d2" : "2px solid white",
        boxShadow: highlighted
          ? "0 0 0 4px rgba(25,118,210,0.35), 0 2px 6px rgba(0,0,0,0.4)"
          : "0 2px 5px rgba(0,0,0,0.3)",
      }}
    >
      <span
        className="material-icons"
        style={{ transform: "rotate(45deg)", color: "white", fontSize: iconFontSize }}
      >
        {style.icon}
      </span>
    </div>
  );

  return L.divIcon({
    className: "custom-marker-icon",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
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

function PopupContent({ location, onEdit }: { location: MapLocation; onEdit: () => void }) {
  return (
    <div style={{ maxWidth: 300 }}>
      <strong>{location.name}</strong><br />
      <em>{location.category}</em><br /><br />
      <strong>Description:</strong> {location.description}<br /><br />
      <strong>Why visit:</strong> {location.whyVisit}
      <LinksSection links={location.links} />
      <br /><br />
      <Button
        size="small"
        variant="outlined"
        startIcon={<EditIcon />}
        onClick={onEdit}
      >
        Edit
      </Button>
    </div>
  );
}

export function LocationMarker({
  location,
  editingMode,
  isMobile,
  isSelected,
  onRemove,
  onEdit,
  onSelect,
}: LocationMarkerProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const markerIcon = buildMarkerIcon(location, isSelected);
  const isAdding = editingMode === "add-marker" || editingMode === "add-zone";

  const handleMarkerClick = () => {
    if (editingMode === "remove") {
      setConfirmOpen(true);
      return;
    }
    if (isMobile && editingMode === "normal") {
      onSelect();
    }
  };

  return (
    <>
      <Marker
        position={[location.lat, location.lng]}
        icon={markerIcon}
        interactive={!isAdding}
        eventHandlers={{
          click: handleMarkerClick,
        }}
      >
        {!isAdding && editingMode !== "remove" && !isMobile && (
          <>
            <Popup maxWidth={320}>
              <PopupContent location={location} onEdit={onEdit} />
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

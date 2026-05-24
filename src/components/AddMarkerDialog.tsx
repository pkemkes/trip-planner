import { TextField } from "@mui/material";
import { useState } from "react";
import { CATEGORY_MARKER_STYLES } from "../data/categoryStyles";
import type { LocationCategory, MapLocation } from "../types/MapTypes";
import { BaseLocationDialog } from "./BaseLocationDialog";

const MARKER_CATEGORIES = (Object.keys(CATEGORY_MARKER_STYLES) as LocationCategory[]).filter(
  (category) => category !== "National Park" && category !== "Scenic Area"
);

interface AddMarkerDialogProps {
  isOpen: boolean;
  initialLatitude: number;
  initialLongitude: number;
  onConfirm: (newLocation: MapLocation) => void;
  onCancel: () => void;
}

export function AddMarkerDialog({
  isOpen,
  initialLatitude,
  initialLongitude,
  onConfirm,
  onCancel,
}: AddMarkerDialogProps) {
  const [latitude, setLatitude] = useState(initialLatitude);
  const [longitude, setLongitude] = useState(initialLongitude);
  const [prevIsOpen, setPrevIsOpen] = useState(false);

  if (isOpen && !prevIsOpen) {
    setLatitude(initialLatitude);
    setLongitude(initialLongitude);
    setPrevIsOpen(true);
  }
  if (!isOpen && prevIsOpen) {
    setPrevIsOpen(false);
  }

  return (
    <BaseLocationDialog
      isOpen={isOpen}
      title="Add Marker"
      submitLabel="Add"
      categories={MARKER_CATEGORIES}
      defaultCategory="Town"
      onCancel={onCancel}
      onSubmit={(data) => {
        onConfirm({
          ...data,
          lat: latitude,
          lng: longitude,
          links: [],
        });
      }}
    >
      <TextField
        label="Latitude"
        type="number"
        value={latitude}
        onChange={(event) => setLatitude(parseFloat(event.target.value))}
        size="small"
        slotProps={{ htmlInput: { step: "any" } }}
      />
      <TextField
        label="Longitude"
        type="number"
        value={longitude}
        onChange={(event) => setLongitude(parseFloat(event.target.value))}
        size="small"
        slotProps={{ htmlInput: { step: "any" } }}
      />
    </BaseLocationDialog>
  );
}

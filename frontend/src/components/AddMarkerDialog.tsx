import { CATEGORY_MARKER_STYLES } from "../data/categoryStyles";
import type { LocationCategory, MapLocation } from "../types/MapTypes";
import { BaseLocationDialog } from "./BaseLocationDialog";

const MARKER_CATEGORIES = (Object.keys(CATEGORY_MARKER_STYLES) as LocationCategory[]).filter(
  (category) => category !== "National Park" && category !== "Scenic Area" && category !== "Stop"
);

interface AddMarkerDialogProps {
  isOpen: boolean;
  initialLatitude: number;
  initialLongitude: number;
  onConfirm: (newLocation: MapLocation) => void;
  onCancel: () => void;
  editingMarker?: MapLocation | null;
}

export function AddMarkerDialog({
  isOpen,
  initialLatitude,
  initialLongitude,
  onConfirm,
  onCancel,
  editingMarker,
}: AddMarkerDialogProps) {
  const latitude = editingMarker?.lat ?? initialLatitude;
  const longitude = editingMarker?.lng ?? initialLongitude;

  const isEditing = !!editingMarker;

  return (
    <BaseLocationDialog
      isOpen={isOpen}
      title={isEditing ? "Edit Marker" : "Add Marker"}
      submitLabel={isEditing ? "Save" : "Add"}
      categories={MARKER_CATEGORIES}
      defaultCategory={editingMarker?.category ?? "Town"}
      initialData={editingMarker ?? undefined}
      onCancel={onCancel}
      onSubmit={(data) => {
        onConfirm({
          ...data,
          lat: latitude,
          lng: longitude,
        });
      }}
    />
  );
}

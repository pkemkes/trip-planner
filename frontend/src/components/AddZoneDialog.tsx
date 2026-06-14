import { Typography } from "@mui/material";
import type { AreaBoundary, LocationCategory } from "../types/MapTypes";
import { BaseLocationDialog } from "./BaseLocationDialog";

const ZONE_CATEGORIES: LocationCategory[] = ["National Park", "Scenic Area", "Stop"];

interface AddZoneDialogProps {
  isOpen: boolean;
  vertexCoordinates: [number, number][];
  onConfirm: (newZone: AreaBoundary) => void;
  onCancel: () => void;
  editingZone?: AreaBoundary | null;
}

export function AddZoneDialog({
  isOpen,
  vertexCoordinates,
  onConfirm,
  onCancel,
  editingZone,
}: AddZoneDialogProps) {
  const isEditing = !!editingZone;
  const coords = isEditing ? editingZone.coords : vertexCoordinates;

  return (
    <BaseLocationDialog
      isOpen={isOpen}
      title={isEditing ? "Edit Zone" : "Add Zone"}
      submitLabel={isEditing ? "Save" : "Add Zone"}
      categories={ZONE_CATEGORIES}
      defaultCategory={editingZone?.category ?? "National Park"}
      initialData={editingZone ?? undefined}
      nameLabel="Zone Name"
      namePlaceholder="Zone name"
      onCancel={onCancel}
      onSubmit={(data) => {
        onConfirm({
          ...data,
          coords,
        });
      }}
      headerContent={
        <Typography variant="body2" color="text.secondary">
          {coords.length} vertices selected
        </Typography>
      }
    />
  );
}

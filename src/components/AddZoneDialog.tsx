import { Typography } from "@mui/material";
import type { AreaBoundary, LocationCategory } from "../types/MapTypes";
import { BaseLocationDialog } from "./BaseLocationDialog";

const ZONE_CATEGORIES: LocationCategory[] = ["National Park", "Scenic Area"];

interface AddZoneDialogProps {
  isOpen: boolean;
  vertexCoordinates: [number, number][];
  onConfirm: (newZone: AreaBoundary) => void;
  onCancel: () => void;
}

export function AddZoneDialog({
  isOpen,
  vertexCoordinates,
  onConfirm,
  onCancel,
}: AddZoneDialogProps) {
  return (
    <BaseLocationDialog
      isOpen={isOpen}
      title="Add Zone"
      submitLabel="Add Zone"
      categories={ZONE_CATEGORIES}
      defaultCategory="National Park"
      nameLabel="Zone Name"
      namePlaceholder="Zone name"
      onCancel={onCancel}
      onSubmit={(data) => {
        onConfirm({
          ...data,
          coords: vertexCoordinates,
          links: [],
        });
      }}
      headerContent={
        <Typography variant="body2" color="text.secondary">
          {vertexCoordinates.length} vertices selected
        </Typography>
      }
    />
  );
}

import { useState } from "react";
import {
  Box,
  Button,
  IconButton,
  Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import AddLocationIcon from "@mui/icons-material/AddLocation";
import PolylineIcon from "@mui/icons-material/Polyline";
import DeleteIcon from "@mui/icons-material/Delete";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import type { EditingMode } from "../types/MapTypes";

interface EditingToolbarProps {
  currentMode: EditingMode;
  zoneVertexCount: number;
  onModeChange: (mode: EditingMode) => void;
  onFinishZone: () => void;
}

const MODE_DESCRIPTIONS: Record<EditingMode, string> = {
  normal: "Click a mode above to start editing.",
  "add-marker": "Click on the map to place a new marker.",
  "add-zone": "Click the map to add zone vertices.",
  remove: "Click a marker or zone to remove it.",
};

export function EditingToolbar({
  currentMode,
  zoneVertexCount,
  onModeChange,
  onFinishZone,
}: EditingToolbarProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Box
      sx={{
        position: "absolute",
        top: 10,
        right: 10,
        zIndex: 1000,
      }}
    >
      {!isOpen ? (
        <IconButton
          onClick={() => setIsOpen(true)}
          sx={{
            backgroundColor: "white",
            boxShadow: 2,
            "&:hover": { backgroundColor: "grey.100" },
          }}
        >
          <EditIcon />
        </IconButton>
      ) : (
        <Box
          sx={{
            backgroundColor: "white",
            borderRadius: 1,
            boxShadow: 2,
            padding: 1.5,
            maxWidth: 280,
            display: "flex",
            flexDirection: "column",
            gap: 0.75,
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "flex-end", marginBottom: 0.5 }}>
            <IconButton
              size="small"
              onClick={() => setIsOpen(false)}
              aria-label="Hide menu"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <Button
            variant={currentMode === "add-marker" ? "contained" : "outlined"}
            startIcon={<AddLocationIcon />}
            onClick={() => onModeChange(currentMode === "add-marker" ? "normal" : "add-marker")}
            size="small"
            fullWidth
            sx={{ justifyContent: "flex-start" }}
          >
            Add Marker
          </Button>

          <Button
            variant={currentMode === "add-zone" ? "contained" : "outlined"}
            startIcon={<PolylineIcon />}
            onClick={() => onModeChange(currentMode === "add-zone" ? "normal" : "add-zone")}
            size="small"
            fullWidth
            sx={{ justifyContent: "flex-start" }}
          >
            Add Zone
          </Button>

          <Button
            variant={currentMode === "remove" ? "contained" : "outlined"}
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => onModeChange(currentMode === "remove" ? "normal" : "remove")}
            size="small"
            fullWidth
            sx={{ justifyContent: "flex-start" }}
          >
            Remove
          </Button>

          {currentMode === "add-zone" && zoneVertexCount >= 3 && (
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckIcon />}
              onClick={onFinishZone}
              size="small"
              fullWidth
              sx={{ justifyContent: "flex-start" }}
            >
              Finish Zone ({zoneVertexCount} vertices)
            </Button>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ marginTop: 0.5 }}>
            {MODE_DESCRIPTIONS[currentMode]}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

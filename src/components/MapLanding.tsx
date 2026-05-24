import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { ConfirmDialog } from "./ConfirmDialog";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface MapListItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface MapLandingProps {
  onCreateMap: (name: string) => Promise<string>;
}

export function MapLanding({ onCreateMap }: MapLandingProps) {
  const [existingMaps, setExistingMaps] = useState<MapListItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [newMapName, setNewMapName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MapListItem | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/maps`)
      .then((res) => res.json())
      .then((maps: MapListItem[]) => setExistingMaps(maps))
      .catch(() => {});
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newMapName.trim()) return;
    setCreating(true);
    try {
      await onCreateMap(newMapName.trim());
    } finally {
      setCreating(false);
    }
  }, [onCreateMap, newMapName]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await fetch(`${API_BASE}/api/maps/${deleteTarget.id}`, { method: "DELETE" });
      setExistingMaps((maps) => maps.filter((m) => m.id !== deleteTarget.id));
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "#f5f5f5",
      }}
    >
      <Paper sx={{ p: 4, maxWidth: 500, width: "100%" }}>
        <Typography variant="h4" gutterBottom>
          Trip Planner
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Create a new map or open an existing one.
        </Typography>

        <Box sx={{ display: "flex", gap: 1, mb: 3 }}>
          <TextField
            size="small"
            label="Map name"
            value={newMapName}
            onChange={(e) => setNewMapName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
            fullWidth
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreate}
            disabled={creating || !newMapName.trim()}
            sx={{ whiteSpace: "nowrap" }}
          >
            {creating ? "Creating..." : "Create"}
          </Button>
        </Box>

        {existingMaps.length > 0 && (
          <>
            <Typography variant="subtitle2" color="text.secondary">
              Existing Maps
            </Typography>
            <List dense>
              {existingMaps.map((map) => (
                <ListItem
                  key={map.id}
                  disablePadding
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(map);
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemButton
                    onClick={() => {
                      window.location.hash = map.id;
                    }}
                  >
                    <ListItemText
                      primary={map.name}
                      secondary={`Updated ${new Date(map.updatedAt).toLocaleDateString()}`}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </>
        )}
      </Paper>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Trip"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}

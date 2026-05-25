import { useCallback, useMemo, useState } from "react";
import { Box, CircularProgress, CssBaseline, Typography } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { TripPlannerMap } from "./components/TripPlannerMap";
import { EditingToolbar } from "./components/EditingToolbar";
import { AddMarkerDialog } from "./components/AddMarkerDialog";
import { AddZoneDialog } from "./components/AddZoneDialog";
import { MapLanding } from "./components/MapLanding";
import { useMapState } from "./hooks/useMapState";
import type { AreaBoundary, EditingMode, MapLocation } from "./types/MapTypes";

const theme = createTheme();

function App() {
  const {
    mapId,
    mapState,
    loading,
    error,
    setUserAddedMarkers,
    setUserAddedZones,
    createNewMap,
  } = useMapState();

  const [editingMode, setEditingMode] = useState<EditingMode>("normal");
  const [zoneDrawingVertices, setZoneDrawingVertices] = useState<[number, number][]>([]);
  const [isMarkerDialogOpen, setIsMarkerDialogOpen] = useState(false);
  const [isZoneDialogOpen, setIsZoneDialogOpen] = useState(false);
  const [pendingMarkerLatitude, setPendingMarkerLatitude] = useState(0);
  const [pendingMarkerLongitude, setPendingMarkerLongitude] = useState(0);
  const [editingMarker, setEditingMarker] = useState<MapLocation | null>(null);
  const [editingZone, setEditingZone] = useState<AreaBoundary | null>(null);

  const userAddedMarkers = useMemo(() => mapState?.userAddedMarkers ?? [], [mapState?.userAddedMarkers]);
  const userAddedZones = useMemo(() => mapState?.userAddedZones ?? [], [mapState?.userAddedZones]);

  const visibleLocations = userAddedMarkers;
  const visibleZones = userAddedZones;

  const handleModeChange = useCallback(
    (newMode: EditingMode) => {
      if (editingMode === "add-zone" && newMode !== "add-zone") {
        setZoneDrawingVertices([]);
      }
      setEditingMode(newMode);
    },
    [editingMode]
  );

  const handleMapClick = useCallback(
    (latitude: number, longitude: number) => {
      if (editingMode === "add-marker") {
        setPendingMarkerLatitude(latitude);
        setPendingMarkerLongitude(longitude);
        setIsMarkerDialogOpen(true);
      } else if (editingMode === "add-zone") {
        setZoneDrawingVertices((previous) => [...previous, [latitude, longitude]]);
      }
    },
    [editingMode]
  );

  const handleConfirmNewMarker = useCallback(
    (newLocation: MapLocation) => {
      if (editingMarker) {
        setUserAddedMarkers((previous) =>
          previous.map((m) =>
            m.name === editingMarker.name && m.lat === editingMarker.lat
              ? newLocation
              : m
          )
        );
      } else {
        setUserAddedMarkers((previous) => [...previous, newLocation]);
      }
      setIsMarkerDialogOpen(false);
      setEditingMarker(null);
    },
    [setUserAddedMarkers, editingMarker]
  );

  const handleFinishZone = useCallback(() => {
    if (zoneDrawingVertices.length < 3) return;
    setIsZoneDialogOpen(true);
  }, [zoneDrawingVertices]);

  const handleConfirmNewZone = useCallback(
    (newZone: AreaBoundary) => {
      if (editingZone) {
        setUserAddedZones((previous) =>
          previous.map((z) => (z.name === editingZone.name ? newZone : z))
        );
      } else {
        setUserAddedZones((previous) => [...previous, newZone]);
      }
      setIsZoneDialogOpen(false);
      setZoneDrawingVertices([]);
      setEditingMode("normal");
      setEditingZone(null);
    },
    [setUserAddedZones, editingZone]
  );

  const handleRemoveLocation = useCallback(
    (location: MapLocation) => {
      setUserAddedMarkers((previous) =>
        previous.filter(
          (marker) => marker.name !== location.name || marker.lat !== location.lat
        )
      );
    },
    [setUserAddedMarkers]
  );

  const handleRemoveZone = useCallback(
    (zone: AreaBoundary) => {
      setUserAddedZones((previous) =>
        previous.filter((userZone) => userZone.name !== zone.name)
      );
    },
    [setUserAddedZones]
  );

  const handleEditLocation = useCallback((location: MapLocation) => {
    setEditingMarker(location);
    setPendingMarkerLatitude(location.lat);
    setPendingMarkerLongitude(location.lng);
    setIsMarkerDialogOpen(true);
  }, []);

  const handleEditZone = useCallback((zone: AreaBoundary) => {
    setEditingZone(zone);
    setIsZoneDialogOpen(true);
  }, []);

  if (!mapId) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <MapLanding onCreateMap={createNewMap} />
      </ThemeProvider>
    );
  }

  if (loading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
          <CircularProgress />
        </Box>
      </ThemeProvider>
    );
  }

  if (error || !mapState) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 2 }}>
          <Typography variant="h5" color="error">
            {error ?? "Map not found"}
          </Typography>
          <Typography variant="body1">
            <a href={window.location.pathname}>Go back to map list</a>
          </Typography>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ position: "relative", height: "100vh" }}>
        <TripPlannerMap
          visibleLocations={visibleLocations}
          visibleZones={visibleZones}
          editingMode={editingMode}
          zoneDrawingVertices={zoneDrawingVertices}
          onMapClick={handleMapClick}
          onRemoveLocation={handleRemoveLocation}
          onRemoveZone={handleRemoveZone}
          onEditLocation={handleEditLocation}
          onEditZone={handleEditZone}
        />

        <Typography
          variant="subtitle1"
          component="h1"
          onClick={() => { window.location.hash = ""; }}
          sx={{
            position: "absolute",
            top: 10,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            backgroundColor: "white",
            borderRadius: 2,
            boxShadow: 2,
            px: 2,
            py: 0.5,
            fontWeight: "bold",
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
        >
          Trip Planner
        </Typography>

        <EditingToolbar
          currentMode={editingMode}
          zoneVertexCount={zoneDrawingVertices.length}
          onModeChange={handleModeChange}
          onFinishZone={handleFinishZone}
        />
      </Box>

      <AddMarkerDialog
        isOpen={isMarkerDialogOpen}
        initialLatitude={pendingMarkerLatitude}
        initialLongitude={pendingMarkerLongitude}
        onConfirm={handleConfirmNewMarker}
        onCancel={() => { setIsMarkerDialogOpen(false); setEditingMarker(null); }}
        editingMarker={editingMarker}
      />

      <AddZoneDialog
        isOpen={isZoneDialogOpen}
        vertexCoordinates={zoneDrawingVertices}
        onConfirm={handleConfirmNewZone}
        onCancel={() => { setIsZoneDialogOpen(false); setEditingZone(null); }}
        editingZone={editingZone}
      />
    </ThemeProvider>
  );
}

export default App;

import { useCallback, useEffect, useRef, useState } from "react";
import type { AreaBoundary, MapLocation } from "../types/MapTypes";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const WS_BASE =
  import.meta.env.VITE_WS_URL ??
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

export interface MapState {
  id: string;
  name: string;
  userAddedMarkers: MapLocation[];
  userAddedZones: AreaBoundary[];
  removedBuiltinMarkerNames: string[];
  removedBuiltinZoneNames: string[];
}

interface UseMapStateReturn {
  mapId: string | null;
  mapState: MapState | null;
  loading: boolean;
  error: string | null;
  setUserAddedMarkers: (updater: MapLocation[] | ((prev: MapLocation[]) => MapLocation[])) => void;
  setUserAddedZones: (updater: AreaBoundary[] | ((prev: AreaBoundary[]) => AreaBoundary[])) => void;
  createNewMap: (name: string) => Promise<string>;
}

export function useMapState(): UseMapStateReturn {
  const [mapState, setMapState] = useState<MapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hashValue, setHashValue] = useState(window.location.hash.slice(1));
  const wsRef = useRef<WebSocket | null>(null);
  const mapIdRef = useRef<string | null>(null);

  // Listen for hash changes
  useEffect(() => {
    const onHashChange = () => setHashValue(window.location.hash.slice(1));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Get map ID from URL hash
  const getMapIdFromUrl = (): string | null => {
    if (!hashValue) return null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(hashValue) ? hashValue : null;
  };

  const mapId = getMapIdFromUrl();

  // Adjust state during render when mapId changes (avoids setState in effect)
  const [prevMapId, setPrevMapId] = useState<string | null | undefined>(undefined);
  if (mapId !== prevMapId) {
    setPrevMapId(mapId);
    if (!mapId) {
      setLoading(false);
      setMapState(null);
      setError(null);
    } else {
      setLoading(true);
      setError(null);
    }
  }

  // Fetch map state
  useEffect(() => {
    if (!mapId) return;

    mapIdRef.current = mapId;

    fetch(`${API_BASE}/api/maps/${mapId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Map not found");
        return res.json();
      })
      .then((data: MapState) => {
        setMapState(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [mapId]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!mapId) return;

    const ws = new WebSocket(`${WS_BASE}/ws?mapId=${mapId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "map-updated") {
          setMapState(message.data);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      // Reconnect after a delay
      if (mapIdRef.current === mapId) {
        setTimeout(() => {
          if (mapIdRef.current === mapId) {
            // Trigger re-render to reconnect
            setMapState((prev) => (prev ? { ...prev } : prev));
          }
        }, 2000);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [mapId]);

  // Persist state to server
  const persistState = useCallback(
    async (newState: MapState) => {
      try {
        const res = await fetch(`${API_BASE}/api/maps/${newState.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newState),
        });
        if (!res.ok) throw new Error("Failed to save");
      } catch (err) {
        console.error("Failed to persist map state:", err);
      }
    },
    []
  );

  const setUserAddedMarkers = useCallback(
    (updater: MapLocation[] | ((prev: MapLocation[]) => MapLocation[])) => {
      setMapState((prev) => {
        if (!prev) return prev;
        const newMarkers =
          typeof updater === "function" ? updater(prev.userAddedMarkers) : updater;
        const newState = { ...prev, userAddedMarkers: newMarkers };
        persistState(newState);
        return newState;
      });
    },
    [persistState]
  );

  const setUserAddedZones = useCallback(
    (updater: AreaBoundary[] | ((prev: AreaBoundary[]) => AreaBoundary[])) => {
      setMapState((prev) => {
        if (!prev) return prev;
        const newZones =
          typeof updater === "function" ? updater(prev.userAddedZones) : updater;
        const newState = { ...prev, userAddedZones: newZones };
        persistState(newState);
        return newState;
      });
    },
    [persistState]
  );

  const createNewMap = useCallback(async (name: string): Promise<string> => {
    const res = await fetch(`${API_BASE}/api/maps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Failed to create map");
    const data: MapState = await res.json();
    window.location.hash = data.id;
    return data.id;
  }, []);

  return {
    mapId,
    mapState,
    loading,
    error,
    setUserAddedMarkers,
    setUserAddedZones,
    createNewMap,
  };
}

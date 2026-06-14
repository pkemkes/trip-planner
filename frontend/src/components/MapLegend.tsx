import { useState } from "react";
import {
  Box,
  Checkbox,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListSubheader,
  Paper,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import type { LocationCategory } from "../types/MapTypes";
import {
  CATEGORY_MARKER_STYLES,
  CATEGORY_ZONE_COLORS,
} from "../data/categoryStyles";

const CATEGORY_ORDER = Object.keys(
  CATEGORY_MARKER_STYLES
) as LocationCategory[];

function sortByCategoryOrder(categories: LocationCategory[]): LocationCategory[] {
  return CATEGORY_ORDER.filter((category) => categories.includes(category));
}

interface MapLegendProps {
  markerCategories: LocationCategory[];
  zoneCategories: LocationCategory[];
  hiddenMarkerCategories: Set<LocationCategory>;
  hiddenZoneCategories: Set<LocationCategory>;
  onToggleMarkerCategory: (category: LocationCategory) => void;
  onToggleZoneCategory: (category: LocationCategory) => void;
}

function LegendRow({
  label,
  checked,
  onToggle,
  swatch,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  swatch: React.ReactNode;
}) {
  return (
    <ListItem
      disableGutters
      onClick={onToggle}
      sx={{
        px: 1,
        py: 0,
        cursor: "pointer",
        "&:hover": { backgroundColor: "action.hover" },
      }}
    >
      <Checkbox
        size="small"
        checked={checked}
        tabIndex={-1}
        disableRipple
        sx={{ p: 0.5 }}
      />
      {swatch}
      <Typography variant="body2" noWrap>
        {label}
      </Typography>
    </ListItem>
  );
}

export function MapLegend({
  markerCategories,
  zoneCategories,
  hiddenMarkerCategories,
  hiddenZoneCategories,
  onToggleMarkerCategory,
  onToggleZoneCategory,
}: MapLegendProps) {
  const [expanded, setExpanded] = useState(false);

  const sortedMarkerCategories = sortByCategoryOrder(markerCategories);
  const sortedZoneCategories = sortByCategoryOrder(zoneCategories);

  return (
    <Paper
      elevation={3}
      sx={{
        position: "absolute",
        bottom: 24,
        right: 24,
        zIndex: 1000,
        borderRadius: 2,
        overflow: "hidden",
        width: 200,
      }}
    >
      <Box
        onClick={() => setExpanded((previous) => !previous)}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1.5,
          py: 1,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
          Legend
        </Typography>
        <IconButton size="small" sx={{ p: 0 }}>
          {expanded ? <ExpandMoreIcon /> : <ExpandLessIcon />}
        </IconButton>
      </Box>

      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <List
          dense
          disablePadding
          sx={{ pb: 0.5, maxHeight: 360, overflowY: "auto" }}
        >
          <ListSubheader
            disableSticky
            sx={{ lineHeight: "28px", fontWeight: "bold" }}
          >
            Pins
          </ListSubheader>
          {sortedMarkerCategories.length === 0 && (
            <ListItem disableGutters sx={{ px: 1, py: 0 }}>
              <Typography variant="body2" color="text.secondary">
                No pins yet
              </Typography>
            </ListItem>
          )}
          {sortedMarkerCategories.map((category) => {
            const markerStyle = CATEGORY_MARKER_STYLES[category];
            return (
              <LegendRow
                key={`marker-${category}`}
                label={category}
                checked={!hiddenMarkerCategories.has(category)}
                onToggle={() => onToggleMarkerCategory(category)}
                swatch={
                  <Box
                    sx={{
                      width: 22,
                      height: 22,
                      minWidth: 22,
                      borderRadius: "50%",
                      backgroundColor: markerStyle.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      mr: 1,
                    }}
                  >
                    <span
                      className="material-icons"
                      style={{ color: "white", fontSize: 13 }}
                    >
                      {markerStyle.icon}
                    </span>
                  </Box>
                }
              />
            );
          })}

          <ListSubheader
            disableSticky
            sx={{ lineHeight: "28px", fontWeight: "bold" }}
          >
            Zones
          </ListSubheader>
          {sortedZoneCategories.length === 0 && (
            <ListItem disableGutters sx={{ px: 1, py: 0 }}>
              <Typography variant="body2" color="text.secondary">
                No zones yet
              </Typography>
            </ListItem>
          )}
          {sortedZoneCategories.map((category) => (
            <LegendRow
              key={`zone-${category}`}
              label={category}
              checked={!hiddenZoneCategories.has(category)}
              onToggle={() => onToggleZoneCategory(category)}
              swatch={
                <Box
                  sx={{
                    width: 22,
                    height: 22,
                    minWidth: 22,
                    borderRadius: "50%",
                    backgroundColor: CATEGORY_ZONE_COLORS[category],
                    mr: 1,
                  }}
                />
              }
            />
          ))}
        </List>
      </Collapse>
    </Paper>
  );
}

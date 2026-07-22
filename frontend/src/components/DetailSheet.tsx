import { Box, Button, IconButton, Link, Paper, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import type { BaseLocation } from "../types/MapTypes";
import { CATEGORY_ZONE_COLORS } from "../data/categoryStyles";

interface DetailSheetProps {
  item: BaseLocation;
  onEdit: () => void;
  onClose: () => void;
}

export function DetailSheet({ item, onEdit, onClose }: DetailSheetProps) {
  const accentColor = CATEGORY_ZONE_COLORS[item.category];

  return (
    <Paper
      elevation={8}
      sx={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1200,
        maxHeight: "33vh",
        display: "flex",
        flexDirection: "column",
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          pt: 1.5,
          pb: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: accentColor,
            flexShrink: 0,
          }}
        />
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: "bold" }} noWrap>
            {item.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {item.category}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close details">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ px: 2, py: 1.5, flexGrow: 1, overflowY: "auto" }}>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          <strong>Description:</strong> {item.description}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          <strong>Why visit:</strong> {item.whyVisit}
        </Typography>
        {item.links.length > 0 && (
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            <strong>Links:</strong>{" "}
            {item.links.map((link, i) => (
              <span key={link.url}>
                {i > 0 && " | "}
                <Link href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.text}
                </Link>
              </span>
            ))}
          </Typography>
        )}
        <Button
          size="small"
          variant="outlined"
          startIcon={<EditIcon />}
          onClick={onEdit}
        >
          Edit
        </Button>
      </Box>
    </Paper>
  );
}

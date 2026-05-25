import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import type { LocationCategory, LocationLink } from "../types/MapTypes";

interface BaseLocationDialogProps {
  isOpen: boolean;
  title: string;
  submitLabel: string;
  categories: LocationCategory[];
  defaultCategory: LocationCategory;
  onSubmit: (data: { name: string; category: LocationCategory; description: string; whyVisit: string; links: LocationLink[] }) => void;
  onCancel: () => void;
  nameLabel?: string;
  namePlaceholder?: string;
  headerContent?: React.ReactNode;
  children?: React.ReactNode;
  initialData?: { name: string; category: LocationCategory; description: string; whyVisit: string; links: LocationLink[] };
}

export function BaseLocationDialog({
  isOpen,
  title,
  submitLabel,
  categories,
  defaultCategory,
  onSubmit,
  onCancel,
  nameLabel = "Name",
  namePlaceholder = "Location name",
  headerContent,
  children,
  initialData,
}: BaseLocationDialogProps) {
  const [name, setName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<LocationCategory>(defaultCategory);
  const [description, setDescription] = useState("");
  const [whyVisitReason, setWhyVisitReason] = useState("");
  const [links, setLinks] = useState<LocationLink[]>([]);
  const [prevIsOpen, setPrevIsOpen] = useState(false);

  if (isOpen && !prevIsOpen) {
    setName(initialData?.name ?? "");
    setSelectedCategory(initialData?.category ?? defaultCategory);
    setDescription(initialData?.description ?? "");
    setWhyVisitReason(initialData?.whyVisit ?? "");
    setLinks(initialData?.links ?? []);
    setPrevIsOpen(true);
  }
  if (!isOpen && prevIsOpen) {
    setPrevIsOpen(false);
  }

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      category: selectedCategory,
      description: description.trim(),
      whyVisit: whyVisitReason.trim(),
      links: links.filter((link) => link.url.trim() !== ""),
    });
  };

  return (
    <Dialog open={isOpen} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: "8px !important" }}>
        {headerContent}
        <TextField
          label={nameLabel}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={namePlaceholder}
          size="small"
        />
        <TextField
          label="Category"
          select
          value={selectedCategory}
          onChange={(event) => setSelectedCategory(event.target.value as LocationCategory)}
          size="small"
        >
          {categories.map((category) => (
            <MenuItem key={category} value={category}>
              {category}
            </MenuItem>
          ))}
        </TextField>
        {children}
        <TextField
          label="Description"
          multiline
          minRows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Brief description"
          size="small"
        />
        <TextField
          label="Why visit"
          multiline
          minRows={2}
          value={whyVisitReason}
          onChange={(event) => setWhyVisitReason(event.target.value)}
          placeholder="Why visit this place?"
          size="small"
        />
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Links
          </Typography>
          {links.map((link, index) => (
            <Box key={index} sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center" }}>
              <TextField
                label="Label"
                value={link.text}
                onChange={(event) => {
                  const updated = [...links];
                  updated[index] = { ...updated[index], text: event.target.value };
                  setLinks(updated);
                }}
                size="small"
                sx={{ flex: 1 }}
              />
              <TextField
                label="URL"
                value={link.url}
                onChange={(event) => {
                  const updated = [...links];
                  updated[index] = { ...updated[index], url: event.target.value };
                  setLinks(updated);
                }}
                size="small"
                sx={{ flex: 2 }}
              />
              <IconButton
                size="small"
                onClick={() => setLinks(links.filter((_, i) => i !== index))}
              >
                ✕
              </IconButton>
            </Box>
          ))}
          <Button
            size="small"
            onClick={() => setLinks([...links, { text: "", url: "" }])}
          >
            + Add Link
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!name.trim()}>
          {submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

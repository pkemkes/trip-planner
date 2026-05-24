import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import { useState } from "react";
import type { LocationCategory } from "../types/MapTypes";

interface BaseLocationDialogProps {
  isOpen: boolean;
  title: string;
  submitLabel: string;
  categories: LocationCategory[];
  defaultCategory: LocationCategory;
  onSubmit: (data: { name: string; category: LocationCategory; description: string; whyVisit: string }) => void;
  onCancel: () => void;
  nameLabel?: string;
  namePlaceholder?: string;
  headerContent?: React.ReactNode;
  children?: React.ReactNode;
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
}: BaseLocationDialogProps) {
  const [name, setName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<LocationCategory>(defaultCategory);
  const [description, setDescription] = useState("");
  const [whyVisitReason, setWhyVisitReason] = useState("");
  const [prevIsOpen, setPrevIsOpen] = useState(false);

  if (isOpen && !prevIsOpen) {
    setName("");
    setSelectedCategory(defaultCategory);
    setDescription("");
    setWhyVisitReason("");
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

export type Tool = "select" | "rect" | "polygon" | "bulk";

export const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  {
    id: "select",
    label: "Select",
    key: "V",
    hint: "Click a zone to select it · drag to move it or its handles · drag empty space to pan · Delete removes",
  },
  { id: "rect", label: "Rectangle", key: "R", hint: "Drag to draw a rectangle · Space-drag or right-drag pans" },
  {
    id: "polygon",
    label: "Polygon",
    key: "P",
    hint: "Click to add points · Enter or click the first point to close · Backspace removes a point · Esc cancels",
  },
  {
    id: "bulk",
    label: "Bulk",
    key: "B",
    hint: "Click a spot to drop a box with the next label; the label counts up · drag pans",
  },
];

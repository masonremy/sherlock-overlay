// Overlay components and the default "full" preset from DESIGN.md, in
// 1920×1080 overlay pixels. Saved layouts live in layouts.json (schema.ts).

export const COMPONENTS = ["header", "focus", "cast", "keys", "notes", "toolkit"] as const;
export type Component = (typeof COMPONENTS)[number];

export const COMPONENT_LABELS: Record<Component, string> = {
  header: "Title bar",
  focus: "Focus area",
  cast: "Cast",
  keys: "Keys",
  notes: "Notes strip",
  toolkit: "Toolkit",
};

export interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  visible: boolean;
  opacity?: number;
  locked?: boolean;
}

export const OVERLAY_SIZE = { w: 1920, h: 1080 } as const;

export const DEFAULT_LAYOUT = {
  header: { x: 0, y: 0, w: 1920, h: 60, z: 1, visible: true },
  focus: { x: 820, y: 60, w: 1100, h: 780, z: 1, visible: true },
  cast: { x: 0, y: 60, w: 360, h: 780, z: 1, visible: true },
  keys: { x: 0, y: 840, w: 360, h: 220, z: 1, visible: true },
  notes: { x: 820, y: 840, w: 1100, h: 220, z: 1, visible: true },
  toolkit: { x: 470, y: 980, w: 240, h: 70, z: 2, visible: true },
} satisfies Record<Component, LayoutRect>;

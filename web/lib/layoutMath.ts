// Layout editor geometry in overlay pixels: moving and resizing boxes with
// snapping to an 8 px grid and to other boxes' edges, and overlap detection.

import { OVERLAY_SIZE } from "../../shared/layout";

export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const GRID = 8;
const SNAP = 8; // px distance at which an edge jumps to a neighbour's
const MIN = 16;

/** Edge positions to snap to along one axis: other boxes' edges and the overlay's. */
function targets(others: Box[], axis: "x" | "y"): number[] {
  const size = axis === "x" ? OVERLAY_SIZE.w : OVERLAY_SIZE.h;
  const out = [0, size];
  for (const o of others) {
    const start = axis === "x" ? o.x : o.y;
    out.push(start, start + (axis === "x" ? o.w : o.h));
  }
  return out;
}

/** Best snap for any of several edges: the shift to apply, or 0. */
function nearest(edges: number[], to: number[]): number | null {
  let best: number | null = null;
  for (const e of edges) for (const t of to) if (Math.abs(t - e) <= SNAP && (best === null || Math.abs(t - e) < Math.abs(best))) best = t - e;
  return best;
}

function snapAxis(start: number, length: number, others: Box[], axis: "x" | "y"): number {
  const shift = nearest([start, start + length], targets(others, axis));
  return shift !== null ? start + shift : Math.round(start / GRID) * GRID;
}

export function moveRect<T extends Box>(r: T, x: number, y: number, others: Box[], snap: boolean): T {
  if (!snap) return { ...r, x: Math.round(x), y: Math.round(y) };
  const rest = others.filter((o) => o.id !== r.id);
  return { ...r, x: snapAxis(x, r.w, rest, "x"), y: snapAxis(y, r.h, rest, "y") };
}

/** Moves one edge (e.g. right) to a position, snapped. */
function snapEdge(pos: number, others: Box[], axis: "x" | "y", snap: boolean): number {
  if (!snap) return Math.round(pos);
  const shift = nearest([pos], targets(others, axis));
  return shift !== null ? pos + shift : Math.round(pos / GRID) * GRID;
}

/** Resizes from a handle by (dx, dy) overlay px. */
export function resizeRect<T extends Box>(r: T, handle: Handle, dx: number, dy: number, others: Box[], snap: boolean): T {
  const rest = others.filter((o) => o.id !== r.id);
  let left = r.x;
  let top = r.y;
  let right = r.x + r.w;
  let bottom = r.y + r.h;
  if (handle.includes("w")) left = Math.min(right - MIN, snapEdge(r.x + dx, rest, "x", snap));
  if (handle.includes("e")) right = Math.max(left + MIN, snapEdge(r.x + r.w + dx, rest, "x", snap));
  if (handle.includes("n")) top = Math.min(bottom - MIN, snapEdge(r.y + dy, rest, "y", snap));
  if (handle.includes("s")) bottom = Math.max(top + MIN, snapEdge(r.y + r.h + dy, rest, "y", snap));
  return { ...r, x: left, y: top, w: right - left, h: bottom - top };
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Boxes partly hidden under one with a higher z (drawn hatched in the editor). */
export function covered(boxes: Box[]): string[] {
  return boxes.filter((a) => boxes.some((b) => b.id !== a.id && b.z > a.z && overlaps(a, b))).map((a) => a.id);
}

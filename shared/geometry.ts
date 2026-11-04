// Zone geometry and id helpers. Works in any consistent coordinate space;
// zones store normalised (0–1) coordinates.

export type Point = [number, number];

/** Area centroid of a polygon; vertex average when the area is ~0. */
export function centroid(points: Point[]): Point {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area) < 1e-12) {
    const n = points.length || 1;
    return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * area), cy / (3 * area)];
}

/** Rectangle corners clockwise from top-left. */
export function rectFromCorners(a: Point, b: Point): Point[] {
  const [x0, x1] = a[0] < b[0] ? [a[0], b[0]] : [b[0], a[0]];
  const [y0, y1] = a[1] < b[1] ? [a[1], b[1]] : [b[1], a[1]];
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

/** An anchor sitting at the old centre follows the shape; a hand-placed one stays put. */
export function anchorAfterReshape(oldPoints: Point[], anchor: Point, newPoints: Point[]): Point {
  const [cx, cy] = centroid(oldPoints);
  const atCentre = Math.abs(cx - anchor[0]) < 1e-6 && Math.abs(cy - anchor[1]) < 1e-6;
  return atCentre ? centroid(newPoints) : anchor;
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Rounds a normalised coordinate: 1e-5 is under 0.1 px on an 8000 px image. */
export function roundCoord(n: number): number {
  return Math.round(clamp01(n) * 1e5) / 1e5;
}

export function roundPoint([x, y]: Point): Point {
  return [roundCoord(x), roundCoord(y)];
}

/** "14 WC" → "15 WC"; keeps zero padding; labels without a number are returned as is. */
export function incrementLabel(label: string): string {
  return label.replace(/\d+/, (digits) => String(Number(digits) + 1).padStart(digits.length, "0"));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = base || "item";
  if (!used.has(root)) return root;
  for (let n = 2; ; n++) {
    if (!used.has(`${root}-${n}`)) return `${root}-${n}`;
  }
}

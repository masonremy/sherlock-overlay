import { describe, expect, it } from "vitest";
import { covered, moveRect, resizeRect, type Box } from "./layoutMath";

const box = (id: string, x: number, y: number, w: number, h: number, z = 1): Box => ({ id, x, y, w, h, z });

describe("moveRect", () => {
  const others = [box("b", 400, 100, 200, 200)];

  it("snaps to the 8 px grid", () => {
    expect(moveRect(box("a", 0, 0, 100, 100), 13, 21, others, true)).toMatchObject({ x: 16, y: 24 });
  });

  it("snaps edges to other boxes and the overlay edge", () => {
    // Right edge (x + 100) lands 5 px short of b's left edge: pulled flush.
    expect(moveRect(box("a", 0, 0, 100, 100), 295, 0, others, true).x).toBe(300);
    // Near the right edge of the 1920 overlay.
    expect(moveRect(box("a", 0, 0, 100, 100), 1815, 0, others, true).x).toBe(1820);
  });

  it("moves freely with snapping off (Alt)", () => {
    expect(moveRect(box("a", 0, 0, 100, 100), 13, 21, others, false)).toMatchObject({ x: 13, y: 21 });
  });
});

describe("resizeRect", () => {
  it("drags the chosen edges and keeps a minimum size", () => {
    const r = box("a", 100, 100, 200, 100);
    expect(resizeRect(r, "se", 37, 21, [], false)).toMatchObject({ x: 100, y: 100, w: 237, h: 121 });
    expect(resizeRect(r, "w", 50, 0, [], false)).toMatchObject({ x: 150, w: 150 });
    expect(resizeRect(r, "n", 0, 500, [], false)).toMatchObject({ y: 184, h: 16 });
  });

  it("snaps the moving edge", () => {
    // Right edge 313 → grid line 312.
    expect(resizeRect(box("a", 100, 100, 200, 100), "e", 13, 0, [], true).w).toBe(212);
  });
});

describe("covered", () => {
  it("lists boxes overlapped by one with a higher z", () => {
    const boxes = [box("map", 800, 60, 1100, 780, 3), box("notes", 820, 700, 1100, 220, 1), box("cast", 0, 60, 360, 780, 1)];
    expect(covered(boxes)).toEqual(["notes"]);
  });
});

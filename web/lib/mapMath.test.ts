import { describe, expect, it } from "vitest";
import { centerOn, clampToImage, fitView, frameBox, toImage, visibleBox, zoomAt } from "./mapMath";

describe("mapMath", () => {
  it("fits the image inside the viewport, centred", () => {
    const v = fitView(4000, 2000, 400, 400, 0);
    expect(v.scale).toBe(0.1);
    expect(v.tx).toBe(0);
    expect(v.ty).toBe(100);
  });

  it("converts screen points to image pixels", () => {
    expect(toImage({ scale: 0.5, tx: 10, ty: 20 }, 110, 70)).toEqual([200, 100]);
  });

  it("zooms around the cursor, keeping the point under it fixed", () => {
    const v0 = { scale: 1, tx: 0, ty: 0 };
    const v1 = zoomAt(v0, 100, 50, 2, 0.1, 10);
    expect(v1.scale).toBe(2);
    expect(toImage(v1, 100, 50)).toEqual(toImage(v0, 100, 50));
  });

  it("clamps the zoom", () => {
    expect(zoomAt({ scale: 1, tx: 0, ty: 0 }, 0, 0, 100, 0.1, 4).scale).toBe(4);
  });

  it("centres a point in the viewport", () => {
    const v = centerOn({ scale: 2, tx: 0, ty: 0 }, 100, 100, 400, 300);
    expect(toImage(v, 200, 150)).toEqual([100, 100]);
  });

  it("keeps a zoomed image covering the viewport", () => {
    // 1000×1000 image at scale 1 in a 400×400 viewport, panned past the top-left corner.
    expect(clampToImage({ scale: 1, tx: 50, ty: -900 }, 1000, 1000, 400, 400)).toEqual({ scale: 1, tx: 0, ty: -600 });
    // Smaller than the viewport: centred.
    expect(clampToImage({ scale: 0.2, tx: 0, ty: 0 }, 1000, 1000, 400, 400)).toEqual({ scale: 0.2, tx: 100, ty: 100 });
  });

  it("frames a box within zoom limits", () => {
    const v = frameBox([400, 400, 600, 500], 1000, 1000, 400, 400, 0.4, 1.5);
    expect(v.scale).toBe(1.5); // would be 2, capped
    const [x0, y0, x1, y1] = visibleBox(v, 400, 400);
    expect((x0 + x1) / 2).toBeCloseTo(500);
    expect((y0 + y1) / 2).toBeCloseTo(450);
  });
});

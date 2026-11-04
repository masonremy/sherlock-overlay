import { describe, expect, it } from "vitest";
import { anchorAfterReshape, centroid, incrementLabel, rectFromCorners, slugify, uniqueId } from "./geometry";

describe("centroid", () => {
  it("finds the centre of a square", () => {
    expect(centroid([[0, 0], [1, 0], [1, 1], [0, 1]])).toEqual([0.5, 0.5]);
  });

  it("weights by area, not by vertex count", () => {
    // L-shape: a 2x1 bar plus a 1x1 block on top of its left half.
    const [x, y] = centroid([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]]);
    expect(x).toBeCloseTo(5 / 6);
    expect(y).toBeCloseTo(5 / 6);
  });

  it("falls back to the vertex average for degenerate shapes", () => {
    expect(centroid([[0, 0], [1, 1], [2, 2]])).toEqual([1, 1]);
  });
});

describe("rectFromCorners", () => {
  it("returns corners clockwise from top-left whatever the drag direction", () => {
    const expected = [[0.1, 0.2], [0.3, 0.2], [0.3, 0.4], [0.1, 0.4]];
    expect(rectFromCorners([0.1, 0.2], [0.3, 0.4])).toEqual(expected);
    expect(rectFromCorners([0.3, 0.4], [0.1, 0.2])).toEqual(expected);
  });
});

describe("anchorAfterReshape", () => {
  const square: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const bigger: [number, number][] = [[0, 0], [2, 0], [2, 2], [0, 2]];

  it("follows the centre when the anchor was at the centre", () => {
    expect(anchorAfterReshape(square, [0.5, 0.5], bigger)).toEqual([1, 1]);
  });

  it("keeps a hand-placed anchor", () => {
    expect(anchorAfterReshape(square, [0.2, 0.8], bigger)).toEqual([0.2, 0.8]);
  });
});

describe("incrementLabel", () => {
  it("increments the first number", () => {
    expect(incrementLabel("14 WC")).toBe("15 WC");
    expect(incrementLabel("NW 42")).toBe("NW 43");
  });

  it("keeps zero padding", () => {
    expect(incrementLabel("Room 09")).toBe("Room 10");
    expect(incrementLabel("GF 007")).toBe("GF 008");
  });

  it("leaves labels without numbers alone", () => {
    expect(incrementLabel("Scotland Yard")).toBe("Scotland Yard");
  });
});

describe("ids", () => {
  it("slugifies labels", () => {
    expect(slugify("14 WC")).toBe("14-wc");
    expect(slugify("  Queen's Park! ")).toBe("queen-s-park");
  });

  it("makes ids unique", () => {
    expect(uniqueId("14-wc", ["a"])).toBe("14-wc");
    expect(uniqueId("14-wc", ["14-wc", "14-wc-2"])).toBe("14-wc-3");
    expect(uniqueId("", [])).toBe("item");
  });
});

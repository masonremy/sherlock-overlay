import { describe, expect, it } from "vitest";
import type { DocText } from "../../shared/docs";
import type { MapDef } from "../../shared/schema";
import { activeStillMatches, addressIn, matchRects, normalizeText, pageHighlights, searchDocs, viewAround, zoneForAddress } from "./docSearch";

const line = (text: string, x = 0.1, y = 0.2, w = 0.4, h = 0.01) => ({
  text,
  x,
  y,
  w,
  h,
  runs: [{ start: 0, end: text.length, x, w }],
});

const directory: DocText = {
  id: "directory",
  pages: [
    { w: 454, h: 794, lines: [line("Intro text")] },
    { w: 454, h: 794, lines: [line("Armitage’s Gallery ....21 NW"), line("Cox & Co Bank ....22 WC", 0.1, 0.3)] },
  ],
};
const paper: DocText = { id: "paper-01", pages: [{ w: 794, h: 1247, lines: [line("Mr Cox was seen at the bank"), line("COX AND SONS")] }] };

describe("normalizeText", () => {
  it("ignores case, accents and curly apostrophes", () => {
    expect(normalizeText("Armitage’s Café")).toBe("armitage's cafe");
  });
});

describe("searchDocs", () => {
  it("finds every match, in document then page order, with the line as a snippet", () => {
    const results = searchDocs([directory, paper], "cox");
    expect(results.map((r) => [r.doc, r.page, r.snippet])).toEqual([
      ["directory", 2, "Cox & Co Bank ....22 WC"],
      ["paper-01", 1, "Mr Cox was seen at the bank"],
      ["paper-01", 1, "COX AND SONS"],
    ]);
  });

  it("matches straight and curly apostrophes alike", () => {
    expect(searchDocs([directory], "armitage's")).toHaveLength(1);
  });

  it("needs at least two characters", () => {
    expect(searchDocs([directory], "c")).toEqual([]);
  });
});

describe("matchRects", () => {
  it("places the highlight over the matched characters, proportionally within the run", () => {
    const l = line("Cox & Co Bank", 0.1, 0.3, 0.26, 0.01); // 13 chars → 0.02 per char
    const [r] = matchRects(l, 9, 13); // "Bank"
    expect(r.x).toBeCloseTo(0.1 + 9 * 0.02);
    expect(r.w).toBeCloseTo(4 * 0.02);
    expect(r.y).toBeCloseTo(0.3);
    expect(r.h).toBeCloseTo(0.01);
  });

  it("covers a match that spans two runs", () => {
    const l = { text: "Sloane Building", x: 0.1, y: 0.3, w: 0.3, h: 0.01, runs: [{ start: 0, end: 6, x: 0.1, w: 0.12 }, { start: 7, end: 15, x: 0.24, w: 0.16 }] };
    expect(matchRects(l, 3, 10)).toHaveLength(2);
  });
});

describe("pageHighlights", () => {
  it("boxes every match on the page, and the active one separately", () => {
    const { all, active } = pageHighlights(paper, 1, "cox", { page: 1, line: 1, start: 0, end: 3 });
    expect(all).toHaveLength(1); // "Mr Cox…"; the active match isn't drawn twice
    expect(active).toHaveLength(1);
    expect(active[0].y).toBeCloseTo(0.2);
  });

  it("draws nothing for another page or a short query", () => {
    expect(pageHighlights(directory, 1, "cox", null)).toEqual({ all: [], active: [] });
    expect(pageHighlights(directory, 2, "", null)).toEqual({ all: [], active: [] });
  });

  it("still shows the active match without a query (a result being pointed at)", () => {
    expect(pageHighlights(directory, 2, "", { page: 2, line: 1, start: 0, end: 3 }).active).toHaveLength(1);
  });
});

describe("activeStillMatches", () => {
  const active = { page: 2, line: 1, start: 0, end: 3 }; // "Cox" in "Cox & Co Bank …"

  it("keeps the chosen result while the search still finds it", () => {
    expect(activeStillMatches(directory, active, "cox")).toBe(true);
    expect(activeStillMatches(directory, active, " COX ")).toBe(true);
  });

  it("drops it once the search is cleared or changed", () => {
    expect(activeStillMatches(directory, active, "")).toBe(false);
    expect(activeStillMatches(directory, active, "bank")).toBe(false);
    expect(activeStillMatches(null, active, "cox")).toBe(false);
  });
});

describe("viewAround", () => {
  it("frames a match: given width, match a third of the way down, inside the page", () => {
    // Page 1.5× as tall as wide; view 0.6 of the page wide, viewport twice as wide as tall.
    const [x0, y0, x1, y1] = viewAround({ x: 0.5, y: 0.5, w: 0.1, h: 0.01 }, 0.6, 0.5, 1.5);
    expect(x1 - x0).toBeCloseTo(0.6);
    expect((x0 + x1) / 2).toBeCloseTo(0.55);
    expect(y1 - y0).toBeCloseTo((0.6 * 0.5) / 1.5); // visible height, in page units
    expect(0.5 - y0).toBeCloseTo((y1 - y0) / 3);
  });

  it("stays on the page near its edges", () => {
    const [x0, y0] = viewAround({ x: 0.01, y: 0.01, w: 0.05, h: 0.01 }, 0.5, 1, 1);
    expect(x0).toBe(0);
    expect(y0).toBe(0);
    const [, , x1, y1] = viewAround({ x: 0.95, y: 0.98, w: 0.05, h: 0.01 }, 0.5, 1, 1);
    expect(x1).toBeCloseTo(1);
    expect(y1).toBeCloseTo(1);
  });
});

describe("addresses", () => {
  it("reads the address at the end of a directory line", () => {
    expect(addressIn("Cox & Co Bank ................22 WC")).toEqual({ label: "22 WC", number: 22, district: "WC" });
    expect(addressIn("Kanary, Gilda ........35 S")).toEqual({ label: "35 S", number: 35, district: "S" });
    expect(addressIn("Roswell, Patience ..... 46 QP")).toEqual({ label: "46 QP", number: 46, district: "QP" });
    expect(addressIn("Mr Cox was seen at the bank")).toBeNull();
  });

  it("finds the zone with that label on the case's maps", () => {
    const maps = [{ id: "london", zones: [{ id: "z1", label: "22 WC" }, { id: "z2", label: "22WC-annex" }] }] as unknown as MapDef[];
    expect(zoneForAddress(maps, { label: "22 WC", number: 22, district: "WC" })).toEqual({ mapId: "london", zoneId: "z1" });
    expect(zoneForAddress(maps, { label: "9 SE", number: 9, district: "SE" })).toBeNull();
  });

  it("matches a zone labelled with just its number, by district", () => {
    const maps = [{ id: "london", zones: [{ id: "w", label: "1", district: "WC" }, { id: "e", label: "1", district: "EC" }] }] as unknown as MapDef[];
    expect(zoneForAddress(maps, { label: "1 EC", number: 1, district: "EC" })).toEqual({ mapId: "london", zoneId: "e" });
  });
});

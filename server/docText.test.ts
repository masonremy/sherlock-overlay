import { describe, expect, it } from "vitest";
import { classifyArtifact, directorySections, docIdFor, linesFromItems, parsePaperDate, reconcilePapers, type RawItem } from "./docText";
import type { DocInfo, DocPage } from "../shared/docs";

// pdf.js text runs: transform [scale, 0, 0, scale, x, baselineY], y measured from the page bottom.
const run = (str: string, x: number, y: number, w: number, size = 8, eol = false): RawItem => ({
  str,
  transform: [size, 0, 0, size, x, y],
  width: w,
  height: size,
  hasEOL: eol,
});

describe("linesFromItems", () => {
  const W = 400;
  const H = 800;

  it("joins runs into lines at end-of-line marks, with normalised boxes (y from the top)", () => {
    const lines = linesFromItems(
      [run("Abbott, Ivo", 40, 700, 52), run(" ", 92, 700, 1), run("......83 SE", 94, 700, 40, 8, true), run("Barlow, Ada", 40, 689, 50), run(".....5 EC", 92, 689, 30, 8, true)],
      W,
      H,
    );
    expect(lines.map((l) => l.text)).toEqual(["Abbott, Ivo ......83 SE", "Barlow, Ada .....5 EC"]);
    const l = lines[0];
    expect(l.x).toBeCloseTo(40 / W);
    expect(l.w).toBeCloseTo((134 - 40) / W);
    expect(l.y).toBeCloseTo((H - 700 - 8 * 0.85) / H); // top of the glyphs
    expect(l.runs.map((r) => l.text.slice(r.start, r.end))).toEqual(["Abbott, Ivo", "......83 SE"]);
  });

  it("starts a new line when the baseline moves, even without an end-of-line mark", () => {
    const lines = linesFromItems([run("BIRTHS", 125, 1139, 45, 11), run("On the 2", 42, 1127, 35, 9)], 800, 1250);
    expect(lines.map((l) => l.text)).toEqual(["BIRTHS", "On the 2"]);
  });

  it("puts a space between runs separated by a gap, but not between touching ones", () => {
    const lines = linesFromItems([run("Barlow", 40, 500, 30), run("Crescent", 74, 500, 35), run("'s", 109, 500, 6, 8, true)], W, H);
    expect(lines[0].text).toBe("Barlow Crescent's");
  });

  it("keeps a drop cap apart from the entry that shares its baseline", () => {
    const lines = linesFromItems([run("C", 36, 600, 30, 55), run("C. Cranmore & Sons", 36, 600, 50), run("......4 E", 90, 600, 30, 8, true)], W, H);
    expect(lines.map((l) => l.text)).toEqual(["C", "C. Cranmore & Sons ......4 E"]);
    expect(lines[1].h).toBeCloseTo((8 * 1.1) / H);
  });

  it("drops empty runs and lines", () => {
    expect(linesFromItems([run("", 76, 697, 0, 50, true), run("  ", 10, 10, 4, 8, true)], W, H)).toEqual([]);
  });
});

describe("classifyArtifact and docIdFor", () => {
  it("sorts the box's PDFs by folder or file name", () => {
    expect(classifyArtifact("B_NEWSPAPER_SH_C4/SH_C4_Journal_03_US_HD.pdf")).toBe("newspaper");
    expect(classifyArtifact("C_DIRECTORY_SH_C4/SH_C4_Annuaire_US_HD.pdf")).toBe("directory");
    expect(classifyArtifact("D_INFORMANTS_SH_C4/SH_C4_informateur_US.pdf")).toBe("informants");
    expect(classifyArtifact("A_BOARD_SH_C4/SH_Plan_C4_US_HD.pdf")).toBe("map");
    expect(classifyArtifact("E_RULES_SH_C4/SHJR_C4_Rules_EN_HD.pdf")).toBe("other");
  });

  it("gives stable ids", () => {
    expect(docIdFor("newspaper", "B_NEWSPAPER_SH_C4/SH_C4_Journal_03_US_HD.pdf")).toBe("paper-03");
    expect(docIdFor("directory", "C/x.pdf")).toBe("directory");
    expect(docIdFor("informants", "D/x.pdf")).toBe("informants");
    expect(docIdFor("other", "E_RULES_SH_C4/SHJR_C4_Rules_EN_HD.pdf")).toBe("shjr-c4-rules-en-hd");
  });
});

describe("parsePaperDate", () => {
  it("reads the masthead date", () => {
    expect(parsePaperDate("N° 12 345 LONDON, THURSDAY, NOVEMBER 19, 1885 Price : 3d.")).toBe("1885-11-19");
    expect(parsePaperDate("LONDON, MONDAY, MARCH 2, 1885")).toBe("1885-03-02");
    expect(parsePaperDate("no date here")).toBeNull();
  });
});

describe("directorySections", () => {
  const line = (text: string, h: number, y = 0.1, x = 0.1) => ({ text, x, y, w: 0.2, h, runs: [] });
  const page = (lines: ReturnType<typeof line>[]): DocPage => ({ w: 454, h: 794, lines });

  it("finds letter and category headings by their size", () => {
    const pages = [
      page([line("The following directory is a listing", 0.012)]),
      page([line("A", 0.063), line("A.B. Pinchbeck & Co ....20 E", 0.01), line("A.B. Ollerton ....41 EC", 0.01)]),
      page([line("B", 0.063), line("Abbott, Ivo ....83 SE", 0.01), line("Barlow, Ada ....5 EC", 0.01)]),
      page([line("Auction Houses", 0.017), line("Quarrington’s Gallery ....21 NW", 0.01), line("Dentists", 0.017), line("Haskett, G.H. ....3 WC", 0.01)]),
    ];
    expect(directorySections(pages).map(({ y: _y, ...s }) => s)).toEqual([
      { label: "A", page: 2, kind: "letter" },
      { label: "B", page: 3, kind: "letter" },
      { label: "Auction Houses", page: 4, kind: "category" },
      { label: "Dentists", page: 4, kind: "category" },
    ]);
  });

  it("joins headings set on two lines, skips page titles, and lists letters A–Z", () => {
    const entries = [line("x ....1 E", 0.01), line("y ....2 E", 0.01), line("z ....3 E", 0.01)];
    const pages = [
      page([line("ALPHABETICAL LIST", 0.017, 0.05), line("K", 0.063, 0.6, 0.66), line("J", 0.063, 0.35, 0.37), ...entries]),
      page([
        line("LIST BY CATEGORY", 0.017, 0.05),
        line("Boarding", 0.017, 0.3, 0.1),
        line("Houses", 0.017, 0.318, 0.12),
        line("Booksellers", 0.017, 0.5, 0.1),
        line("Carpets", 0.017, 0.3, 0.4),
        ...entries,
      ]),
    ];
    expect(directorySections(pages)).toEqual([
      { label: "J", page: 1, kind: "letter", y: 0.35 },
      { label: "K", page: 1, kind: "letter", y: 0.6 },
      { label: "Boarding Houses", page: 2, kind: "category", y: 0.3 },
      { label: "Booksellers", page: 2, kind: "category", y: 0.5 },
      { label: "Carpets", page: 2, kind: "category", y: 0.3 },
    ]);
  });
});

describe("reconcilePapers", () => {
  const doc = (id: string, file: string, date: string | null): DocInfo => ({ id, kind: "newspaper", title: `Newspaper ${id.slice(-2)}`, file, pages: 2, date, sections: [] });

  it("lists every newspaper PDF, dropping placeholder images and keeping the streamer's edits", () => {
    const existing = {
      old: { id: "old", file: "np-0123456789abcdef.png", date: "1889-01-01", title: "placeholder" },
      "paper-01": { id: "paper-01", file: "B/J_01.pdf", date: "1885-11-20", title: "The Times" },
    };
    const result = reconcilePapers(existing as never, [doc("paper-01", "B/J_01.pdf", "1885-11-19"), doc("paper-02", "B/J_02.pdf", "1885-11-21")]);
    expect(result).toEqual({
      "paper-01": { id: "paper-01", file: "B/J_01.pdf", date: "1885-11-20", title: "The Times" },
      "paper-02": { id: "paper-02", file: "B/J_02.pdf", date: "1885-11-21", title: "Newspaper 02" },
    });
  });
});

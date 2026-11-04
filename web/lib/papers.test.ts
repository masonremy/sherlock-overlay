import { describe, expect, it } from "vitest";
import type { Paper } from "../../shared/schema";
import { shelfPapers } from "./papers";

const p = (id: string, date: string | null): Paper => ({ id, file: "np-0123456789abcdef.webp", date, title: "" });
const library = Object.fromEntries([p("p10", "1889-03-10"), p("p14", "1889-03-14"), p("p15", "1889-03-15"), p("p16", "1889-03-16"), p("x", null)].map((x) => [x.id, x]));

describe("shelfPapers", () => {
  it("is the case's paper plus earlier-dated papers, oldest first", () => {
    expect(shelfPapers(library, "p14").map((x) => x.id)).toEqual(["p10", "p14"]);
  });

  it("in timesheet mode each new day unlocks the next day's paper", () => {
    expect(shelfPapers(library, "p14", 2).map((x) => x.id)).toEqual(["p10", "p14", "p15"]);
    expect(shelfPapers(library, "p14", 3).map((x) => x.id)).toEqual(["p10", "p14", "p15", "p16"]);
  });

  it("an undated paper stands alone; no paper, no shelf", () => {
    expect(shelfPapers(library, "x").map((x) => x.id)).toEqual(["x"]);
    expect(shelfPapers(library, null)).toEqual([]);
  });
});

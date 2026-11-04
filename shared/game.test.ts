import { describe, expect, it } from "vitest";
import { countedLeads, currentInvestigator, formatClock, scoreCase, timesheet } from "./game";
import type { MapDef, TrailStep } from "./schema";

const step = (id: string, zoneId: string | null, extra: Partial<TrailStep> = {}): TrailStep => ({
  id,
  mapId: zoneId ? "qp" : null,
  zoneId,
  kind: "lead",
  customLabel: zoneId ? null : "x",
  note: "",
  characterIds: [],
  by: null,
  clock: null,
  duration: null,
  at: "",
  ...extra,
});

describe("scoring", () => {
  const trail = [step("t1", "a"), step("t2", "b"), step("t3", "c", { kind: "reread" }), step("t4", "d"), step("t5", "e")];

  it("counts leads, minus those the solution declares free", () => {
    expect(countedLeads(trail, [])).toBe(4);
    expect(countedLeads(trail, ["t2", "t3"])).toBe(3);
  });

  it("scores points minus 5 per lead over Holmes, plus 5 per lead under", () => {
    expect(scoreCase({ series1: 60, series2: 40, holmesLeads: 3, freeStepIds: [] }, trail)).toEqual({ points: 100, leads: 4, score: 95 });
    expect(scoreCase({ series1: 60, series2: 40, holmesLeads: 6, freeStepIds: [] }, trail)).toEqual({ points: 100, leads: 4, score: 110 });
  });

  it("keeps the score hidden until Holmes's count is entered", () => {
    expect(scoreCase({ series1: 60, series2: null, holmesLeads: null, freeStepIds: [] }, trail).score).toBeNull();
  });
});

describe("lead investigator", () => {
  const players = [{ id: "p1", name: "Ann" }, { id: "p2", name: "Ben" }, { id: "p3", name: "Cy" }];
  it("passes left each turn", () => {
    expect(currentInvestigator(players, [])?.name).toBe("Ann");
    expect(currentInvestigator(players, [step("t1", "a"), step("t2", "b")])?.name).toBe("Cy");
    expect(currentInvestigator(players, [step("1", "a"), step("2", "a"), step("3", "a")])?.name).toBe("Ann");
    expect(currentInvestigator([], [])).toBeNull();
  });
});

describe("timesheet", () => {
  const zone = (id: string, district: string) => ({ id, label: id, district, shape: "rect", points: [], anchor: [0, 0], visible: true });
  const maps = {
    qp: {
      id: "qp",
      zones: [zone("a", "N"), zone("b", "N"), zone("c", "E"), zone("d", "S")],
      // N — E — S: N and S are two areas apart.
      adjacency: { N: ["E"], E: ["N", "S"] },
    },
  } as unknown as Record<string, MapDef>;

  it("starts day 1 at 9 a.m.", () => {
    expect(timesheet([], maps).now).toEqual({ day: 1, minutes: 9 * 60 });
  });

  it("adds 15 min travel within or to an adjacent area, 15 more per area crossed, plus the lead's duration", () => {
    const t = timesheet(
      [step("t1", "a", { duration: 30 }), step("t2", "b", { duration: 10 }), step("t3", "c"), step("t4", "a"), step("t5", "d")],
      maps,
    );
    expect(t.steps.map((s) => s.minutes - 9 * 60)).toEqual([45, 70, 85, 100, 130]);
  });

  it("dead ends cost 5 minutes; off-map leads cost their duration only", () => {
    const t = timesheet([step("t1", "a", { kind: "deadEnd", duration: 60 }), step("t2", null, { duration: 20 })], maps);
    expect(t.steps.map((s) => s.minutes - 9 * 60)).toEqual([5, 25]);
  });

  it("rolls over to the next morning at 10 p.m.", () => {
    const t = timesheet([step("t1", "a", { duration: 13 * 60 })], maps); // 9:15 + 13h = 22:15
    expect(t.now).toEqual({ day: 2, minutes: 9 * 60 + 15 });
  });

  it("formats like the game", () => {
    expect(formatClock({ day: 1, minutes: 10 * 60 + 15 })).toBe("Day 1 · 10:15 a.m.");
    expect(formatClock({ day: 2, minutes: 12 * 60 })).toBe("Day 2 · 12:00 p.m.");
    expect(formatClock({ day: 3, minutes: 21 * 60 + 5 })).toBe("Day 3 · 9:05 p.m.");
  });
});

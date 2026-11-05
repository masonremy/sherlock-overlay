import { describe, expect, it } from "vitest";
import type { MapDef, Note, TrailStep } from "../../shared/schema";
import { cardSource, cardTilt } from "./evidence";

const maps = { london: { id: "london", zones: [{ id: "a", label: "13 SW" }, { id: "b", label: "4 WC" }] } } as unknown as Record<string, MapDef>;
const step = (id: string, zoneId: string | null): TrailStep => ({
  id,
  mapId: zoneId ? "london" : null,
  zoneId,
  kind: "lead",
  customLabel: zoneId ? null : "Telegram",
  note: "",
  characterIds: [],
  by: null,
  clock: null,
  duration: null,
  at: "",
});
const note = (extra: Partial<Note>): Note => ({ id: "n", text: "x", tag: "clue", pinned: true, hidden: false, stepIds: [], characterIds: [], places: [], ...extra });

describe("cardSource", () => {
  const trail = [step("t1", "b"), step("t2", null), step("t3", "a")];

  it("names the step a clue came from", () => {
    expect(cardSource(note({ stepIds: ["t3"] }), trail, maps)).toBe("from 13 SW, step 3");
    expect(cardSource(note({ stepIds: ["t2"] }), trail, maps)).toBe("from Telegram, step 2");
  });

  it("uses the earliest linked step", () => {
    expect(cardSource(note({ stepIds: ["t3", "t1"] }), trail, maps)).toBe("from 4 WC, step 1");
  });

  it("falls back to a linked place, or nothing", () => {
    expect(cardSource(note({ places: [{ mapId: "london", zoneId: "a" }] }), trail, maps)).toBe("re 13 SW");
    expect(cardSource(note({}), trail, maps)).toBeNull();
  });
});

describe("cardTilt", () => {
  it("is a small, stable angle per card", () => {
    expect(cardTilt("n1")).toBe(cardTilt("n1"));
    for (const id of ["a", "b", "n1", "clue-42"]) expect(Math.abs(cardTilt(id))).toBeLessThanOrEqual(2.5);
  });
});

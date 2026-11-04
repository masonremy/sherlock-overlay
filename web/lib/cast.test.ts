import { describe, expect, it } from "vitest";
import type { Character, LetterKey, MapDef, TrailStep } from "../../shared/schema";
import { castOrder, defaultCameo, facesByZone, searchCharacters, suggestKind } from "./cast";

const step = (id: string, zoneId: string | null, characterIds: string[] = [], kind: TrailStep["kind"] = "lead"): TrailStep => ({
  id,
  mapId: zoneId ? "london" : null,
  zoneId,
  kind,
  customLabel: zoneId ? null : "x",
  note: "",
  characterIds,
  by: null,
  clock: null,
  duration: null,
  at: "",
});

const char = (id: string, name: string, extra: Partial<Character> = {}): Character => ({
  id,
  name,
  role: "",
  status: "witness",
  portrait: null,
  cameo: null,
  address: null,
  notes: "",
  hidden: false,
  ...extra,
});

describe("castOrder", () => {
  it("orders by first appearance on the trail, unmet characters last, hidden ones left out", () => {
    const chars = [char("a", "A"), char("b", "B"), char("c", "C"), char("h", "H", { hidden: true })];
    const trail = [step("t1", "z1"), step("t2", "z2", ["c"]), step("t3", "z1", ["a", "c", "h"])];
    expect(castOrder(chars, trail).map((c) => c.id)).toEqual(["c", "a", "b"]);
  });
});

describe("facesByZone", () => {
  it("collects visible characters met at each zone of a map", () => {
    const chars = [char("a", "A"), char("b", "B"), char("h", "H", { hidden: true })];
    const trail = [step("t1", "z1", ["a"]), step("t2", null, ["b"]), step("t3", "z1", ["b", "a", "h"])];
    expect(Object.fromEntries(Object.entries(facesByZone(trail, "london", chars)).map(([z, cs]) => [z, cs.map((c) => c.id)]))).toEqual({
      z1: ["a", "b"],
    });
  });
});

describe("suggestKind", () => {
  const key = (letter: string, unlockedAtStep: string | null): LetterKey => ({ letter, unlocked: !!unlockedAtStep, unlockedAtStep, note: "" });

  it("suggests a re-read when returning after unlocking a letter", () => {
    const trail = [step("t1", "z1"), step("t2", "z2"), step("t3", "z3")];
    expect(suggestKind(trail, [key("A", "t2")], "london", "z1")).toBe("reread");
  });

  it("suggests a lead otherwise", () => {
    const trail = [step("t1", "z1"), step("t2", "z2")];
    expect(suggestKind(trail, [key("A", "t1")], "london", "z9")).toBe("lead"); // never visited
    expect(suggestKind(trail, [key("A", "t1")], "london", "z2")).toBe("lead"); // unlocked before the last visit
    expect(suggestKind(trail, [], "london", "z1")).toBe("lead"); // no letters
  });
});

describe("searchCharacters", () => {
  const maps = {
    london: { id: "london", zones: [{ id: "z1", label: "14 WC" }] },
  } as unknown as Record<string, MapDef>;

  it("finds characters with an address by name", () => {
    const chars = [char("a", "Mrs. Example", { address: { mapId: "london", zoneId: "z1" } }), char("b", "Mr. Nobody")];
    expect(searchCharacters("exam", chars, maps, ["london"])).toEqual([
      { character: chars[0], mapId: "london", zone: { id: "z1", label: "14 WC" } },
    ]);
    expect(searchCharacters("nobody", chars, maps, ["london"])).toEqual([]);
  });
});

describe("defaultCameo", () => {
  it("is stable for an id and valid", () => {
    const c = defaultCameo("c1");
    expect(defaultCameo("c1")).toEqual(c);
    expect(c.head).toBeGreaterThanOrEqual(0);
    expect(c.head).toBeLessThanOrEqual(3);
  });
});

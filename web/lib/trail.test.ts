import { describe, expect, it } from "vitest";
import type { MapDef, TrailStep } from "../../shared/schema";
import { frameAnchors, leadCount, pathSegments, pinGroups, searchPlaces, searchZones } from "./trail";

const step = (id: string, zoneId: string | null, kind: TrailStep["kind"] = "lead", mapId = "london"): TrailStep => ({
  id,
  mapId: zoneId ? mapId : null,
  zoneId,
  kind,
  customLabel: zoneId ? null : "Elsewhere",
  note: "",
  characterIds: [],
  by: null,
  clock: null,
  duration: null,
  at: "",
});

describe("pinGroups", () => {
  it("stacks revisits on one pin and numbers by trail position", () => {
    const trail = [step("t1", "a"), step("t2", "b"), step("t3", "a")];
    expect(pinGroups(trail, "london")).toEqual([
      { zoneId: "a", label: "1 · 3", hollow: false, lastIndex: 2 },
      { zoneId: "b", label: "2", hollow: false, lastIndex: 1 },
    ]);
  });

  it("shows re-reads and dead ends as hollow pins without numbers", () => {
    const trail = [step("t1", "a", "reread"), step("t2", "b", "deadEnd"), step("t3", "b", "free")];
    expect(pinGroups(trail, "london")).toEqual([
      { zoneId: "a", label: "", hollow: true, lastIndex: 0 },
      { zoneId: "b", label: "3", hollow: false, lastIndex: 2 },
    ]);
  });

  it("ignores off-map steps and other maps", () => {
    const trail = [step("t1", null), step("t2", "a", "lead", "whitechapel"), step("t3", "a")];
    expect(pinGroups(trail, "london").map((g) => g.label)).toEqual(["3"]);
  });
});

describe("pathSegments", () => {
  it("joins consecutive steps, skipping off-map leads and repeats of the same zone", () => {
    const trail = [step("t1", "a"), step("t2", null), step("t3", "b"), step("t4", "b"), step("t5", "c")];
    expect(pathSegments(trail, "london")).toEqual([
      { key: "t1>t3", from: "a", to: "b", toIndex: 2 },
      { key: "t4>t5", from: "b", to: "c", toIndex: 4 },
    ]);
  });

  it("breaks the path where the trail goes to another map", () => {
    const trail = [step("t1", "a"), step("t2", "w", "lead", "whitechapel"), step("t3", "b")];
    expect(pathSegments(trail, "london")).toEqual([]);
  });
});

describe("leadCount", () => {
  it("counts only lead steps", () => {
    expect(leadCount([step("t1", "a"), step("t2", "a", "reread"), step("t3", null), step("t4", "b", "free")])).toBe(2);
  });
});

describe("frameAnchors", () => {
  it("returns anchors of the last n on-map steps on the map", () => {
    const anchors = { a: [0.1, 0.1], b: [0.5, 0.5], c: [0.9, 0.9] } as Record<string, [number, number]>;
    const trail = [step("t1", "a"), step("t2", "b"), step("t3", null), step("t4", "c"), step("t5", "c")];
    expect(frameAnchors(trail, "london", anchors, 3)).toEqual([[0.5, 0.5], [0.9, 0.9], [0.9, 0.9]]);
  });
});

describe("searchPlaces", () => {
  const zone = (id: string, label: string) => ({ id, label, district: "", shape: "rect" as const, points: [], anchor: [0, 0] as [number, number], visitable: true });
  const maps = [
    {
      id: "london",
      name: "London",
      zones: [zone("a", "13 SW"), zone("b", "4 WC")],
      informants: [{ id: "i1", name: "Scotland Yard", zoneId: "a" }],
    },
  ] as unknown as MapDef[];

  it("finds informants by name, labelled with their address", () => {
    expect(searchPlaces("scot", maps)).toEqual([{ mapId: "london", mapName: "London", zone: maps[0].zones[0], informant: "Scotland Yard" }]);
  });

  it("finds zones by label, naming the informant who lives there", () => {
    expect(searchPlaces("13sw", maps)[0]).toMatchObject({ zone: { label: "13 SW" }, informant: "Scotland Yard" });
    expect(searchPlaces("4wc", maps)[0]).toMatchObject({ zone: { label: "4 WC" }, informant: undefined });
  });

  it("lists each place once", () => {
    expect(searchPlaces("s", maps).filter((m) => m.zone.id === "a")).toHaveLength(1);
  });
});

describe("searchZones", () => {
  const zone = (id: string, label: string, district = "") => ({
    id,
    label,
    district,
    shape: "rect" as const,
    points: [],
    anchor: [0, 0] as [number, number],
    visitable: true,
  });
  const maps = [
    { id: "london", name: "London", zones: [zone("a", "14 WC", "WC"), zone("b", "4 WC", "WC"), zone("c", "41 SE", "SE")] },
    { id: "wc", name: "Whitechapel", zones: [zone("d", "Scotland Yard")] },
  ] as unknown as MapDef[];

  it("ignores case, spaces and punctuation, exact matches first", () => {
    expect(searchZones("4wc", maps).map((r) => r.zone.label)).toEqual(["4 WC", "14 WC"]);
    expect(searchZones("14 wc", maps)[0].zone.label).toBe("14 WC");
  });

  it("matches the start of words", () => {
    expect(searchZones("scot", maps)).toEqual([expect.objectContaining({ mapId: "wc" })]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchZones("  ", maps)).toEqual([]);
  });
});

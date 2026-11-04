import { describe, expect, it } from "vitest";
import { parseAction } from "./actions";
import { ActionError, reduce } from "./reducer";
import { createInitialState, Note, TrailStep, type AppState } from "./schema";

const T = "2026-11-01T20:00:00Z";

/** Parses like the server does, then reduces. */
function run(state: AppState, raw: unknown): AppState {
  const parsed = parseAction(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return reduce(state, parsed.action);
}

const rectZone = (id: string, label = "14 WC") => ({
  id,
  label,
  district: "WC",
  shape: "rect",
  points: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]],
  anchor: [0.15, 0.15],
});

const london = { id: "london", name: "London", image: "img-abc.png", imageSize: [4000, 2800] };

function withMap(): AppState {
  return run(createInitialState(T), { type: "map/create", map: london });
}

function withZone(): AppState {
  return run(withMap(), { type: "zone/add", mapId: "london", zone: rectZone("wc-14") });
}

describe("map/create", () => {
  it("adds an empty map and uses it in the case", () => {
    const s = withMap();
    expect(s.maps.london).toMatchObject({ id: "london", name: "London", zones: [] });
    expect(s.case.mapIds).toEqual(["london"]);
  });

  it("rejects a duplicate id", () => {
    expect(() => run(withMap(), { type: "map/create", map: london })).toThrow(ActionError);
  });

  it("rejects ids that are unsafe as file names", () => {
    for (const id of ["../x", "London", "a b", ""]) {
      expect(parseAction({ type: "map/create", map: { ...london, id } }).ok).toBe(false);
    }
  });

  it("rejects unsafe image names", () => {
    expect(parseAction({ type: "map/create", map: { ...london, image: "../secret.png" } }).ok).toBe(false);
  });
});

describe("map/import", () => {
  const def = { ...london, zones: [rectZone("wc-14")] };

  it("adds a full definition and uses it in the case", () => {
    const s = run(createInitialState(T), { type: "map/import", map: def, replace: false });
    expect(s.maps.london.zones).toHaveLength(1);
    expect(s.maps.london.zones[0].visitable).toBe(true);
    expect(s.case.mapIds).toEqual(["london"]);
  });

  it("refuses to overwrite unless asked", () => {
    expect(() => run(withMap(), { type: "map/import", map: def, replace: false })).toThrow(ActionError);
    const s = run(withMap(), { type: "map/import", map: def, replace: true });
    expect(s.maps.london.zones).toHaveLength(1);
    expect(s.case.mapIds).toEqual(["london"]);
  });

  it("validates zones", () => {
    const bad = (zones: unknown[]) => parseAction({ type: "map/import", map: { ...london, zones }, replace: false }).ok;
    expect(bad([{ ...rectZone("a"), points: [[0, 0], [1, 0], [1, 1]] }])).toBe(false); // rect needs 4 points
    expect(bad([{ ...rectZone("a"), anchor: [1.5, 0] }])).toBe(false); // outside 0–1
    expect(bad([rectZone("a"), rectZone("a")])).toBe(false); // duplicate ids
  });

  it("keeps unknown top-level fields so newer files survive a round trip", () => {
    const s = run(createInitialState(T), { type: "map/import", map: { ...def, informants: [{ name: "x" }] }, replace: false });
    expect((s.maps.london as Record<string, unknown>).informants).toEqual([{ name: "x" }]);
  });
});

describe("map/rename and map/setImage", () => {
  it("renames", () => {
    expect(run(withMap(), { type: "map/rename", mapId: "london", name: "City" }).maps.london.name).toBe("City");
  });

  it("replaces the image and keeps the zones", () => {
    const s = run(withZone(), { type: "map/setImage", mapId: "london", image: "img-new.webp", imageSize: [8000, 5600] });
    expect(s.maps.london.image).toBe("img-new.webp");
    expect(s.maps.london.imageSize).toEqual([8000, 5600]);
    expect(s.maps.london.zones).toHaveLength(1);
  });

  it("rejects unknown maps", () => {
    expect(() => run(withMap(), { type: "map/rename", mapId: "nope", name: "x" })).toThrow(ActionError);
  });
});

describe("map/delete", () => {
  it("removes the map from the library and the case", () => {
    const s = run(withMap(), { type: "map/delete", mapId: "london" });
    expect(s.maps).toEqual({});
    expect(s.case.mapIds).toEqual([]);
  });

  it("refuses while the trail uses the map", () => {
    const s = { ...withZone(), trail: [TrailStep.parse({ id: "t1", mapId: "london", zoneId: "wc-14", at: T })] };
    expect(() => run(s, { type: "map/delete", mapId: "london" })).toThrow(/trail/);
  });
});

describe("case/addMap and case/removeMap", () => {
  it("toggles a library map in and out of the case", () => {
    let s = run(withMap(), { type: "case/removeMap", mapId: "london" });
    expect(s.case.mapIds).toEqual([]);
    expect(s.maps.london).toBeDefined();
    s = run(s, { type: "case/addMap", mapId: "london" });
    expect(s.case.mapIds).toEqual(["london"]);
    s = run(s, { type: "case/addMap", mapId: "london" });
    expect(s.case.mapIds).toEqual(["london"]);
  });

  it("rejects unknown maps", () => {
    expect(() => run(withMap(), { type: "case/addMap", mapId: "nope" })).toThrow(ActionError);
  });

  it("refuses to remove a map the trail uses", () => {
    const s = { ...withZone(), trail: [TrailStep.parse({ id: "t1", mapId: "london", zoneId: "wc-14", at: T })] };
    expect(() => run(s, { type: "case/removeMap", mapId: "london" })).toThrow(ActionError);
  });
});

describe("zone/add", () => {
  it("adds a zone with defaults", () => {
    const zone = withZone().maps.london.zones[0];
    expect(zone).toMatchObject({ id: "wc-14", label: "14 WC", shape: "rect", visitable: true });
  });

  it("accepts polygons with 3 or more points", () => {
    const tri = { ...rectZone("tri"), shape: "polygon", points: [[0, 0], [0.5, 0], [0.5, 0.5]] };
    expect(run(withMap(), { type: "zone/add", mapId: "london", zone: tri }).maps.london.zones).toHaveLength(1);
  });

  it("rejects duplicate zone ids and unknown maps", () => {
    expect(() => run(withZone(), { type: "zone/add", mapId: "london", zone: rectZone("wc-14") })).toThrow(ActionError);
    expect(() => run(withZone(), { type: "zone/add", mapId: "nope", zone: rectZone("x") })).toThrow(ActionError);
  });

  it("rejects empty labels", () => {
    expect(parseAction({ type: "zone/add", mapId: "london", zone: rectZone("x", "") }).ok).toBe(false);
  });
});

describe("zone/update", () => {
  const update = (s: AppState, patch: unknown) => run(s, { type: "zone/update", mapId: "london", zoneId: "wc-14", patch });

  it("patches label, district, visitable and anchor", () => {
    const zone = update(withZone(), { label: "15 WC", district: "EC", visitable: false, anchor: [0.12, 0.13] }).maps.london.zones[0];
    expect(zone).toMatchObject({ id: "wc-14", label: "15 WC", district: "EC", visitable: false, anchor: [0.12, 0.13] });
  });

  it("moves points", () => {
    const points = [[0.3, 0.3], [0.4, 0.3], [0.4, 0.4], [0.3, 0.4]];
    expect(update(withZone(), { points }).maps.london.zones[0].points).toEqual(points);
  });

  it("can turn a rectangle into a polygon and add points", () => {
    const points = [[0.1, 0.1], [0.15, 0.05], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]];
    const zone = update(withZone(), { shape: "polygon", points }).maps.london.zones[0];
    expect(zone.shape).toBe("polygon");
    expect(zone.points).toHaveLength(5);
  });

  it("rejects a result that is not a valid zone", () => {
    expect(() => update(withZone(), { points: [[0, 0], [1, 0], [1, 1]] })).toThrow(ActionError);
  });

  it("does not let the id change", () => {
    expect(parseAction({ type: "zone/update", mapId: "london", zoneId: "wc-14", patch: { id: "x" } }).ok).toBe(false);
  });

  it("rejects unknown zones", () => {
    expect(() => run(withZone(), { type: "zone/update", mapId: "london", zoneId: "nope", patch: { label: "x" } })).toThrow(
      ActionError,
    );
  });
});

describe("zone/delete", () => {
  const del = (s: AppState) => run(s, { type: "zone/delete", mapId: "london", zoneId: "wc-14" });

  it("removes the zone", () => {
    expect(del(withZone()).maps.london.zones).toEqual([]);
  });

  it("refuses while a trail step or note refers to it", () => {
    const step = TrailStep.parse({ id: "t1", mapId: "london", zoneId: "wc-14", at: T });
    expect(() => del({ ...withZone(), trail: [step] })).toThrow(/trail/);
    const note = Note.parse({ id: "n1", text: "x", places: [{ mapId: "london", zoneId: "wc-14" }] });
    expect(() => del({ ...withZone(), notes: [note] })).toThrow(/note/);
  });
});

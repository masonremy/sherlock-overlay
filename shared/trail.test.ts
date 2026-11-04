import { describe, expect, it } from "vitest";
import { parseAction } from "./actions";
import { ActionError, reduce } from "./reducer";
import { createInitialState, LetterKey, Note, type AppState } from "./schema";

const T = "2026-11-01T20:00:00Z";

function run(state: AppState, raw: unknown): AppState {
  const parsed = parseAction(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return reduce(state, parsed.action);
}

const rect = (id: string, label: string, visitable = true) => ({
  id,
  label,
  shape: "rect",
  points: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]],
  anchor: [0.15, 0.15],
  visitable,
});

/** A case using map "london" with zones a, b, c and an off-limits zone x. */
function base(): AppState {
  let s = run(createInitialState(T), {
    type: "map/import",
    map: {
      id: "london",
      image: "l.png",
      imageSize: [100, 100],
      zones: [rect("a", "1 WC"), rect("b", "2 WC"), rect("c", "3 SE"), rect("x", "9 E", false)],
    },
    replace: false,
  });
  s = run(s, { type: "map/import", map: { id: "spare", image: "s.png", imageSize: [10, 10], zones: [rect("z", "Z")] }, replace: false });
  return run(s, { type: "case/removeMap", mapId: "spare" });
}

const add = (s: AppState, id: string, zoneId: string | null, extra: Record<string, unknown> = {}) =>
  run(s, {
    type: "trail/add",
    step: { id, mapId: zoneId ? "london" : null, zoneId, at: T, ...extra },
    ...("index" in extra ? { index: extra.index } : {}),
  });

/** Trail a → b → c as t1, t2, t3. */
function withTrail(): AppState {
  return add(add(add(base(), "t1", "a"), "t2", "b"), "t3", "c");
}

const ids = (s: AppState, list: "trail" | "trailDraft" = "trail") => (s[list] ?? []).map((t) => t.id);

describe("trail/add", () => {
  it("appends a step with defaults", () => {
    const s = add(base(), "t1", "a");
    expect(s.trail).toEqual([
      expect.objectContaining({ id: "t1", mapId: "london", zoneId: "a", kind: "lead", customLabel: null, note: "", at: T }),
    ]);
  });

  it("inserts at an index", () => {
    const s = run(withTrail(), { type: "trail/add", step: { id: "t9", mapId: "london", zoneId: "a", at: T }, index: 1 });
    expect(ids(s)).toEqual(["t1", "t9", "t2", "t3"]);
  });

  it("records an off-map lead with a label", () => {
    const s = add(base(), "t1", null, { customLabel: "Telegram to Lestrade" });
    expect(s.trail[0]).toMatchObject({ mapId: null, zoneId: null, customLabel: "Telegram to Lestrade" });
  });

  it("allows revisiting a zone", () => {
    expect(ids(add(withTrail(), "t4", "a"))).toHaveLength(4);
  });

  it("rejects bad references", () => {
    expect(() => add(base(), "t1", "nope")).toThrow(ActionError); // unknown zone
    expect(() => add(base(), "t1", "x")).toThrow(/not visitable/); // off-limits
    expect(() => run(base(), { type: "trail/add", step: { id: "t1", mapId: "spare", zoneId: "z", at: T } })).toThrow(
      /not used in this case/,
    );
    expect(() => add(base(), "t1", null)).toThrow(ActionError); // neither zone nor label
    expect(() => add(base(), "t1", "a", { customLabel: "both" })).toThrow(ActionError); // both
    expect(() => add(withTrail(), "t1", "a")).toThrow(/already/); // duplicate id
  });

  it("rejects an index past the end", () => {
    expect(() => run(base(), { type: "trail/add", step: { id: "t1", mapId: "london", zoneId: "a", at: T }, index: 3 })).toThrow(
      ActionError,
    );
  });
});

describe("trail/update", () => {
  const update = (s: AppState, patch: unknown, stepId = "t2") => run(s, { type: "trail/update", stepId, patch });

  it("edits note and kind", () => {
    const step = update(withTrail(), { note: "Met the landlady", kind: "reread" }).trail[1];
    expect(step).toMatchObject({ id: "t2", note: "Met the landlady", kind: "reread" });
  });

  it("replaces the zone", () => {
    expect(update(withTrail(), { zoneId: "c" }).trail[1].zoneId).toBe("c");
  });

  it("refuses to move a step onto a zone that is not visitable", () => {
    expect(() => update(withTrail(), { zoneId: "x" })).toThrow(/not visitable/);
  });

  it("turns an on-map step into an off-map one and back", () => {
    let s = update(withTrail(), { mapId: null, zoneId: null, customLabel: "Newspaper ad" });
    expect(s.trail[1]).toMatchObject({ mapId: null, zoneId: null, customLabel: "Newspaper ad" });
    s = update(s, { mapId: "london", zoneId: "a", customLabel: null });
    expect(s.trail[1]).toMatchObject({ zoneId: "a", customLabel: null });
  });

  it("rejects unknown steps and inconsistent results", () => {
    expect(() => update(withTrail(), { note: "x" }, "nope")).toThrow(ActionError);
    expect(() => update(withTrail(), { customLabel: "also a label" })).toThrow(ActionError);
  });
});

describe("trail/delete", () => {
  it("removes the step", () => {
    expect(ids(run(withTrail(), { type: "trail/delete", stepId: "t2" }))).toEqual(["t1", "t3"]);
  });

  it("keeps a key unlocked and re-stamps it to the previous step", () => {
    const s = { ...withTrail(), keys: [LetterKey.parse({ letter: "A", unlocked: true, unlockedAtStep: "t2" })] };
    const next = run(s, { type: "trail/delete", stepId: "t2" });
    expect(next.keys[0]).toMatchObject({ unlocked: true, unlockedAtStep: "t1" });
  });

  it("clears the stamp when there is no previous step", () => {
    const s = { ...withTrail(), keys: [LetterKey.parse({ letter: "A", unlocked: true, unlockedAtStep: "t1" })] };
    expect(run(s, { type: "trail/delete", stepId: "t1" }).keys[0]).toMatchObject({ unlocked: true, unlockedAtStep: null });
  });

  it("drops the step from notes and from the free-step list", () => {
    const s: AppState = {
      ...withTrail(),
      notes: [Note.parse({ id: "n1", text: "x", stepIds: ["t1", "t2"] })],
      scoring: { ...withTrail().scoring, freeStepIds: ["t2", "t3"] },
    };
    const next = run(s, { type: "trail/delete", stepId: "t2" });
    expect(next.notes[0].stepIds).toEqual(["t1"]);
    expect(next.scoring.freeStepIds).toEqual(["t3"]);
  });
});

describe("trail/move", () => {
  it("moves a step to a new position", () => {
    expect(ids(run(withTrail(), { type: "trail/move", stepId: "t3", toIndex: 0 }))).toEqual(["t3", "t1", "t2"]);
    expect(ids(run(withTrail(), { type: "trail/move", stepId: "t1", toIndex: 2 }))).toEqual(["t2", "t3", "t1"]);
  });

  it("rejects out-of-range targets", () => {
    expect(() => run(withTrail(), { type: "trail/move", stepId: "t1", toIndex: 3 })).toThrow(ActionError);
  });
});

describe("staged trail edits", () => {
  const begin = (s: AppState) => run(s, { type: "trail/beginEdit" });

  it("beginEdit copies the trail into a draft", () => {
    const s = begin(withTrail());
    expect(ids(s, "trailDraft")).toEqual(["t1", "t2", "t3"]);
  });

  it("edits change the draft, not what viewers see", () => {
    let s = begin(withTrail());
    s = run(s, { type: "trail/delete", stepId: "t2" });
    s = add(s, "t4", "a");
    s = run(s, { type: "trail/update", stepId: "t1", patch: { note: "draft note" } });
    expect(ids(s)).toEqual(["t1", "t2", "t3"]);
    expect(s.trail[0].note).toBe("");
    expect(ids(s, "trailDraft")).toEqual(["t1", "t3", "t4"]);
  });

  it("apply publishes the draft in one change and fixes references", () => {
    let s = { ...withTrail(), keys: [LetterKey.parse({ letter: "B", unlocked: true, unlockedAtStep: "t2" })] };
    s = begin(s);
    s = run(s, { type: "trail/delete", stepId: "t2" });
    expect(s.keys[0].unlockedAtStep).toBe("t2"); // untouched while staged
    s = run(s, { type: "trail/apply" });
    expect(ids(s)).toEqual(["t1", "t3"]);
    expect(s.trailDraft).toBeNull();
    expect(s.keys[0].unlockedAtStep).toBe("t1");
  });

  it("discard throws the draft away", () => {
    let s = begin(withTrail());
    s = run(s, { type: "trail/delete", stepId: "t2" });
    s = run(s, { type: "trail/discard" });
    expect(ids(s)).toEqual(["t1", "t2", "t3"]);
    expect(s.trailDraft).toBeNull();
  });

  it("rejects starting twice or applying without a draft", () => {
    expect(() => begin(begin(withTrail()))).toThrow(ActionError);
    expect(() => run(withTrail(), { type: "trail/apply" })).toThrow(ActionError);
    expect(() => run(withTrail(), { type: "trail/discard" })).toThrow(ActionError);
  });

  it("refuses to delete a zone that only the draft uses", () => {
    let s = begin(base());
    s = add(s, "t1", "a");
    expect(() => run(s, { type: "zone/delete", mapId: "london", zoneId: "a" })).toThrow(/trail/);
  });
});

describe("overlay map settings", () => {
  it("sets the map view mode", () => {
    expect(run(base(), { type: "overlay/setMapView", mode: "mirror" }).overlay.mapView).toBe("mirror");
    expect(parseAction({ type: "overlay/setMapView", mode: "sideways" }).ok).toBe(false);
  });

  it("pins a map or follows the trail", () => {
    let s = run(base(), { type: "overlay/setMap", mapId: "london" });
    expect(s.overlay.mapId).toBe("london");
    s = run(s, { type: "overlay/setMap", mapId: null });
    expect(s.overlay.mapId).toBeNull();
    expect(() => run(base(), { type: "overlay/setMap", mapId: "spare" })).toThrow(ActionError);
  });
});

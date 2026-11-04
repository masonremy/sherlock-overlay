import { describe, expect, it } from "vitest";
import { parseAction } from "./actions";
import { ActionError, reduce } from "./reducer";
import { createInitialState, Note, type AppState } from "./schema";

const T = "2026-11-01T20:00:00Z";

function run(state: AppState, raw: unknown): AppState {
  const parsed = parseAction(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return reduce(state, parsed.action);
}

const zone = (id: string, label: string) => ({
  id,
  label,
  shape: "rect",
  points: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]],
  anchor: [0.15, 0.15],
});

/** A case on map "london" with a two-step trail t1 (a) → t2 (b). */
function base(): AppState {
  let s = run(createInitialState(T), {
    type: "map/import",
    map: { id: "london", image: "l.png", imageSize: [100, 100], zones: [zone("a", "1 WC"), zone("b", "2 WC")] },
    replace: false,
  });
  for (const [id, zoneId] of [["t1", "a"], ["t2", "b"]]) {
    s = run(s, { type: "trail/add", step: { id, mapId: "london", zoneId, at: T } });
  }
  return s;
}

const addChar = (s: AppState, id = "c1", extra: Record<string, unknown> = {}, stepId?: string) =>
  run(s, { type: "character/add", character: { id, name: "Mrs. Example", ...extra }, ...(stepId ? { stepId } : {}) });

describe("character/add", () => {
  it("adds a character with defaults", () => {
    expect(addChar(base()).characters).toEqual([
      {
        id: "c1",
        name: "Mrs. Example",
        role: "",
        status: "witness",
        portrait: null,
        cameo: null,
        address: null,
        notes: "",
        hidden: false,
      },
    ]);
  });

  it("links the character to a step in the same change", () => {
    const s = addChar(base(), "c1", { role: "Landlady" }, "t2");
    expect(s.trail[1].characterIds).toEqual(["c1"]);
  });

  it("links to the draft while the trail is being edited", () => {
    let s = run(base(), { type: "trail/beginEdit" });
    s = addChar(s, "c1", {}, "t2");
    expect(s.trailDraft![1].characterIds).toEqual(["c1"]);
    expect(s.trail[1].characterIds).toEqual([]);
  });

  it("accepts a cameo and an address", () => {
    const s = addChar(base(), "c1", {
      cameo: { head: 2, top: "bowler", face: "moustache" },
      address: { mapId: "london", zoneId: "a" },
    });
    expect(s.characters[0]).toMatchObject({ cameo: { head: 2, top: "bowler", face: "moustache" }, address: { zoneId: "a" } });
  });

  it("rejects bad input", () => {
    expect(() => addChar(addChar(base()))).toThrow(/already/);
    expect(() => addChar(base(), "c1", {}, "nope")).toThrow(ActionError);
    expect(() => addChar(base(), "c1", { address: { mapId: "london", zoneId: "zz" } })).toThrow(ActionError);
    expect(parseAction({ type: "character/add", character: { id: "c1", name: " " } }).ok).toBe(false);
    expect(parseAction({ type: "character/add", character: { id: "c1", name: "x", portrait: "../x.png" } }).ok).toBe(false);
    expect(
      parseAction({ type: "character/add", character: { id: "c1", name: "x", cameo: { head: 9, top: "bare", face: "none" } } }).ok,
    ).toBe(false);
  });
});

describe("character/update", () => {
  const update = (s: AppState, patch: unknown) => run(s, { type: "character/update", characterId: "c1", patch });

  it("edits fields live", () => {
    const c = update(addChar(base()), {
      name: "Mrs. Hudson",
      status: "suspect",
      portrait: "p-0123456789abcdef.webp",
      hidden: true,
      notes: "Muddy boots",
    }).characters[0];
    expect(c).toMatchObject({ name: "Mrs. Hudson", status: "suspect", portrait: "p-0123456789abcdef.webp", hidden: true });
  });

  it("removing the portrait brings the cameo back", () => {
    let s = update(addChar(base()), { portrait: "p-0123456789abcdef.webp" });
    s = update(s, { portrait: null });
    expect(s.characters[0].portrait).toBeNull();
  });

  it("validates", () => {
    expect(() => update(addChar(base()), { address: { mapId: "nope", zoneId: "a" } })).toThrow(ActionError);
    expect(() => run(base(), { type: "character/update", characterId: "zz", patch: { name: "x" } })).toThrow(ActionError);
    expect(parseAction({ type: "character/update", characterId: "c1", patch: { id: "c2" } }).ok).toBe(false);
  });
});

describe("character/delete", () => {
  it("removes the character and every link to it", () => {
    let s = addChar(base(), "c1", {}, "t1");
    s = run(s, { type: "trail/beginEdit" });
    s = run(s, { type: "trail/update", stepId: "t2", patch: { characterIds: ["c1"] } });
    s = { ...s, notes: [Note.parse({ id: "n1", text: "x", characterIds: ["c1"] })] };
    s = run(s, { type: "character/delete", characterId: "c1" });
    expect(s.characters).toEqual([]);
    expect(s.trail[0].characterIds).toEqual([]);
    expect(s.trailDraft![1].characterIds).toEqual([]);
    expect(s.notes[0].characterIds).toEqual([]);
  });
});

describe("linking characters to steps", () => {
  it("trail/update only accepts known characters", () => {
    const s = addChar(base());
    expect(run(s, { type: "trail/update", stepId: "t1", patch: { characterIds: ["c1"] } }).trail[0].characterIds).toEqual(["c1"]);
    expect(() => run(s, { type: "trail/update", stepId: "t1", patch: { characterIds: ["ghost"] } })).toThrow(ActionError);
  });
});

describe("letter keys", () => {
  const addKey = (s: AppState, raw: Record<string, unknown>) => run(s, { type: "key/add", ...raw });

  it("adds a letter locked by default, upper-cased", () => {
    expect(addKey(base(), { letter: "a" }).keys).toEqual([{ letter: "A", unlocked: false, unlockedAtStep: null, note: "" }]);
  });

  it("can add and unlock in one go, stamped to a step", () => {
    expect(addKey(base(), { letter: "B", unlocked: true, stepId: "t2" }).keys[0]).toMatchObject({
      unlocked: true,
      unlockedAtStep: "t2",
    });
  });

  it("rejects duplicates, bad letters and unknown steps", () => {
    expect(() => addKey(addKey(base(), { letter: "A" }), { letter: "a" })).toThrow(/already/);
    expect(parseAction({ type: "key/add", letter: "a b" }).ok).toBe(false);
    expect(parseAction({ type: "key/add", letter: "" }).ok).toBe(false);
    expect(() => addKey(base(), { letter: "A", unlocked: true, stepId: "nope" })).toThrow(ActionError);
  });

  it("unlocking stamps a step; locking clears the stamp", () => {
    let s = addKey(base(), { letter: "A" });
    s = run(s, { type: "key/update", letter: "A", patch: { unlocked: true, unlockedAtStep: "t1" } });
    expect(s.keys[0]).toMatchObject({ unlocked: true, unlockedAtStep: "t1" });
    s = run(s, { type: "key/update", letter: "A", patch: { unlocked: false } });
    expect(s.keys[0]).toMatchObject({ unlocked: false, unlockedAtStep: null });
  });

  it("renames, re-stamps and notes", () => {
    let s = addKey(base(), { letter: "A", unlocked: true, stepId: "t1" });
    s = run(s, { type: "key/update", letter: "A", patch: { letter: "c", unlockedAtStep: "t2", note: "from the cabbie" } });
    expect(s.keys[0]).toEqual({ letter: "C", unlocked: true, unlockedAtStep: "t2", note: "from the cabbie" });
    s = addKey(s, { letter: "D" });
    expect(() => run(s, { type: "key/update", letter: "D", patch: { letter: "C" } })).toThrow(/already/);
  });

  it("deletes", () => {
    const s = run(addKey(base(), { letter: "A" }), { type: "key/delete", letter: "A" });
    expect(s.keys).toEqual([]);
    expect(() => run(s, { type: "key/delete", letter: "A" })).toThrow(ActionError);
  });
});

describe("portrait library", () => {
  const add = (s: AppState, id = "p1") =>
    run(s, { type: "portrait/add", portrait: { id, file: "p-0123456789abcdef.webp", tags: ["older man", "constable"] } });

  it("adds, retags and removes portraits", () => {
    let s = add(base());
    expect(s.portraits.p1).toEqual({ id: "p1", file: "p-0123456789abcdef.webp", tags: ["older man", "constable"] });
    s = run(s, { type: "portrait/update", portraitId: "p1", tags: ["maid"] });
    expect(s.portraits.p1.tags).toEqual(["maid"]);
    s = run(s, { type: "portrait/delete", portraitId: "p1" });
    expect(s.portraits).toEqual({});
  });

  it("rejects duplicates and unknown ids", () => {
    expect(() => add(add(base()))).toThrow(ActionError);
    expect(() => run(base(), { type: "portrait/delete", portraitId: "nope" })).toThrow(ActionError);
  });
});

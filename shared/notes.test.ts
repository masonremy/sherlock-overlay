import { describe, expect, it } from "vitest";
import { parseAction } from "./actions";
import { describeAction } from "./describe";
import { ActionError, reduce } from "./reducer";
import { createInitialState, type AppState } from "./schema";

const T = "2026-11-01T20:00:00Z";

function run(state: AppState, raw: unknown): AppState {
  const parsed = parseAction(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return reduce(state, parsed.action);
}

/** Map "london" with zones a and b, step t1 at a, character c1. */
function base(): AppState {
  let s = run(createInitialState(T), {
    type: "map/import",
    map: {
      id: "london",
      image: "l.png",
      imageSize: [100, 100],
      zones: ["a", "b"].map((id) => ({
        id,
        label: id.toUpperCase(),
        shape: "rect",
        points: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]],
        anchor: [0.15, 0.15],
      })),
    },
    replace: false,
  });
  s = run(s, { type: "trail/add", step: { id: "t1", mapId: "london", zoneId: "a", at: T } });
  return run(s, { type: "character/add", character: { id: "c1", name: "Mrs. Example" } });
}

const addNote = (s: AppState, id: string, extra: Record<string, unknown> = {}, index?: number) =>
  run(s, { type: "note/add", note: { id, text: `note ${id}`, ...extra }, ...(index === undefined ? {} : { index }) });

describe("note/add", () => {
  it("adds a private, untagged note at the top by default", () => {
    const s = addNote(addNote(base(), "n1"), "n2");
    expect(s.notes.map((n) => n.id)).toEqual(["n2", "n1"]);
    expect(s.notes[1]).toEqual({
      id: "n1",
      text: "note n1",
      tag: null,
      pinned: false,
      hidden: false,
      stepIds: [],
      characterIds: [],
      places: [],
    });
  });

  it("inserts at an index", () => {
    const s = addNote(addNote(addNote(base(), "n1"), "n2"), "n3", {}, 2);
    expect(s.notes.map((n) => n.id)).toEqual(["n2", "n1", "n3"]);
  });

  it("accepts tags, pins and links", () => {
    const n = addNote(base(), "n1", {
      text: "Muddy boots @[c1]",
      tag: "clue",
      pinned: true,
      stepIds: ["t1"],
      characterIds: ["c1"],
      places: [{ mapId: "london", zoneId: "b" }],
    }).notes[0];
    expect(n).toMatchObject({ tag: "clue", pinned: true, stepIds: ["t1"], characterIds: ["c1"], places: [{ zoneId: "b" }] });
  });

  it("rejects bad notes", () => {
    expect(() => addNote(addNote(base(), "n1"), "n1")).toThrow(/already/);
    expect(parseAction({ type: "note/add", note: { id: "n1", text: "   " } }).ok).toBe(false);
    expect(parseAction({ type: "note/add", note: { id: "n1", text: "x", tag: "rumour" } }).ok).toBe(false);
    expect(() => addNote(base(), "n1", { stepIds: ["nope"] })).toThrow(ActionError);
    expect(() => addNote(base(), "n1", { characterIds: ["nope"] })).toThrow(ActionError);
    expect(() => addNote(base(), "n1", { places: [{ mapId: "london", zoneId: "zz" }] })).toThrow(ActionError);
  });
});

describe("note/update, delete, move", () => {
  it("edits text, tag, pin, hidden and links", () => {
    let s = addNote(base(), "n1");
    s = run(s, {
      type: "note/update",
      noteId: "n1",
      patch: { text: "Who wrote the letter?", tag: "question", pinned: true, hidden: true, characterIds: ["c1"] },
    });
    expect(s.notes[0]).toMatchObject({ text: "Who wrote the letter?", tag: "question", pinned: true, hidden: true, characterIds: ["c1"] });
    s = run(s, { type: "note/update", noteId: "n1", patch: { tag: null } });
    expect(s.notes[0].tag).toBeNull();
  });

  it("validates updates", () => {
    const s = addNote(base(), "n1");
    expect(() => run(s, { type: "note/update", noteId: "nope", patch: { pinned: true } })).toThrow(ActionError);
    expect(() => run(s, { type: "note/update", noteId: "n1", patch: { stepIds: ["nope"] } })).toThrow(ActionError);
    expect(parseAction({ type: "note/update", noteId: "n1", patch: { id: "n2" } }).ok).toBe(false);
  });

  it("deletes", () => {
    const s = run(addNote(base(), "n1"), { type: "note/delete", noteId: "n1" });
    expect(s.notes).toEqual([]);
  });

  it("reorders", () => {
    let s = addNote(addNote(addNote(base(), "n1"), "n2"), "n3"); // n3 n2 n1
    s = run(s, { type: "note/move", noteId: "n1", toIndex: 0 });
    expect(s.notes.map((n) => n.id)).toEqual(["n1", "n3", "n2"]);
    expect(() => run(s, { type: "note/move", noteId: "n1", toIndex: 3 })).toThrow(ActionError);
  });
});

describe("focus area", () => {
  const focus = (s: AppState, f: string) => run(s, { type: "overlay/setFocus", focus: f });

  it("defaults to the map", () => {
    expect(base().overlay).toMatchObject({ focus: "map", focusPrev: "map" });
  });

  it("remembers what was there before", () => {
    let s = focus(base(), "notes");
    expect(s.overlay).toMatchObject({ focus: "notes", focusPrev: "map" });
    s = focus(s, "newspaper");
    expect(s.overlay).toMatchObject({ focus: "newspaper", focusPrev: "notes" });
  });

  it("returning restores the previous item, then falls back to the map", () => {
    let s = focus(focus(base(), "notes"), "newspaper");
    s = run(s, { type: "overlay/returnFocus" });
    expect(s.overlay).toMatchObject({ focus: "notes", focusPrev: "map" });
    s = run(s, { type: "overlay/returnFocus" });
    expect(s.overlay).toMatchObject({ focus: "map", focusPrev: "map" });
  });

  it("selecting the current item changes nothing", () => {
    const s = focus(base(), "notes");
    expect(focus(s, "notes").overlay).toEqual(s.overlay);
  });
});

describe("overlay/configure", () => {
  it("sets visibility and notes options", () => {
    const s = run(base(), {
      type: "overlay/configure",
      patch: { hideAll: true, hideMap: true, notesGroup: "step", noteRings: false, notesAutoScroll: false },
    });
    expect(s.overlay).toMatchObject({ hideAll: true, hideMap: true, notesGroup: "step", noteRings: false, notesAutoScroll: false });
  });

  it("defaults are safe: everything visible, rings on, grouped by tag", () => {
    expect(base().overlay).toMatchObject({ hideAll: false, hideMap: false, notesGroup: "tag", noteRings: true });
  });

  it("rejects unknown settings", () => {
    expect(parseAction({ type: "overlay/configure", patch: { focus: "notes" } }).ok).toBe(false);
  });

  it("describes the panic toggle clearly", () => {
    const a = parseAction({ type: "overlay/configure", patch: { hideAll: true } });
    expect(a.ok && describeAction(a.action, base())).toBe("Hid everything on the overlay");
  });
});

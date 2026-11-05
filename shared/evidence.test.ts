import { describe, expect, it } from "vitest";
import { parseAction } from "./actions";
import { ActionError, reduce } from "./reducer";
import { createInitialState, type AppState } from "./schema";

const T = "2026-11-01T20:00:00Z";

function run(state: AppState, raw: unknown): AppState {
  const parsed = parseAction(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return reduce(state, parsed.action);
}

/** A map with zone a, step t1, players Ann and Ben, a clue note and a plain note. */
function base(): AppState {
  let s = run(createInitialState(T), {
    type: "map/import",
    map: {
      id: "london",
      image: "l.png",
      imageSize: [100, 100],
      zones: [{ id: "a", label: "13 SW", shape: "rect", points: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]], anchor: [0.15, 0.15] }],
    },
    replace: false,
  });
  s = run(s, { type: "case/update", patch: { players: [{ id: "p1", name: "Ann" }, { id: "p2", name: "Ben" }] } });
  s = run(s, { type: "trail/add", step: { id: "t1", mapId: "london", zoneId: "a", at: T, by: "p1" } });
  s = run(s, { type: "note/add", note: { id: "clue", text: "Muddy boots, size 10", tag: "clue", pinned: true, stepIds: ["t1"] } });
  return run(s, { type: "note/add", note: { id: "plain", text: "Just a thought" } });
}

describe("evidence cards", () => {
  it("Show card puts a clue in the focus area and remembers what was there", () => {
    let s = run(base(), { type: "overlay/setFocus", focus: "notes" });
    s = run(s, { type: "overlay/showCard", noteId: "clue" });
    expect(s.overlay).toMatchObject({ focus: "card", focusPrev: "notes", cardNoteId: "clue" });
    s = run(s, { type: "overlay/returnFocus" });
    expect(s.overlay.focus).toBe("notes");
  });

  it("showing another card while one is up keeps the original place to return to", () => {
    let s = run(base(), { type: "note/update", noteId: "plain", patch: { tag: "clue" } });
    s = run(s, { type: "overlay/showCard", noteId: "clue" });
    s = run(s, { type: "overlay/showCard", noteId: "plain" });
    expect(s.overlay).toMatchObject({ focus: "card", focusPrev: "map", cardNoteId: "plain" });
  });

  it("only clue notes become cards", () => {
    expect(() => run(base(), { type: "overlay/showCard", noteId: "plain" })).toThrow(/clue/);
    expect(() => run(base(), { type: "overlay/showCard", noteId: "nope" })).toThrow(ActionError);
  });

  it("deleting the note on show takes the card down", () => {
    let s = run(base(), { type: "overlay/showCard", noteId: "clue" });
    s = run(s, { type: "note/delete", noteId: "clue" });
    expect(s.overlay).toMatchObject({ focus: "map", cardNoteId: null });
  });

  it("the expanded notes view can lay clues out as a card wall", () => {
    expect(run(base(), { type: "overlay/configure", patch: { notesGroup: "cards" } }).overlay.notesGroup).toBe("cards");
  });

  it("evidence cards have their own font settings", () => {
    const s = run(base(), { type: "theme/set", theme: { components: { cards: { display: "Special Elite", scale: 1.1 } } } });
    expect(s.theme.components.cards).toMatchObject({ display: "Special Elite", scale: 1.1 });
  });
});

describe("editing a step's investigator", () => {
  it("sets or clears whose turn a step was", () => {
    let s = run(base(), { type: "trail/update", stepId: "t1", patch: { by: "p2" } });
    expect(s.trail[0].by).toBe("p2");
    s = run(s, { type: "trail/update", stepId: "t1", patch: { by: null } });
    expect(s.trail[0].by).toBeNull();
  });

  it("only accepts players in the case", () => {
    expect(() => run(base(), { type: "trail/update", stepId: "t1", patch: { by: "ghost" } })).toThrow(/player/);
    expect(() => run(base(), { type: "trail/add", step: { id: "t2", mapId: "london", zoneId: "a", at: T, by: "ghost" } })).toThrow(/player/);
  });

  it("a step whose player has since left the table can still be edited", () => {
    let s = run(base(), { type: "case/update", patch: { players: [{ id: "p2", name: "Ben" }] } });
    s = run(s, { type: "trail/update", stepId: "t1", patch: { note: "still editable" } });
    expect(s.trail[0]).toMatchObject({ note: "still editable", by: "p1" });
  });
});

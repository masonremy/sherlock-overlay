import { describe, expect, it } from "vitest";
import { seedCase } from "./cases";
import { CaseState, LetterKey, Note, TrailStep } from "./schema";

const T = "2026-11-05T19:00:00Z";

function current(): CaseState {
  return CaseState.parse({
    rev: 40,
    case: { title: "The Tin Soldier", number: "3", box: "Thames Murders", mapIds: ["london"], campaignId: null, players: [{ id: "p1", name: "Ann" }], startedAt: "2026-11-01T20:00:00Z" },
    trail: [TrailStep.parse({ id: "t1", mapId: "london", zoneId: "a", at: T, characterIds: ["c1"] })],
    characters: [{ id: "c1", name: "Mrs. Example", status: "suspect" }],
    keys: [LetterKey.parse({ letter: "A", unlocked: true, unlockedAtStep: "t1" })],
    notes: [
      Note.parse({ id: "n1", text: "pinned", pinned: true, stepIds: ["t1"], characterIds: ["c1"] }),
      Note.parse({ id: "n2", text: "private", pinned: false }),
    ],
    newspaper: { paperId: "p3", opened: true },
    scoring: { series1: 50, holmesLeads: 6, freeStepIds: ["t1"] },
    overlay: { layoutId: "corner", focus: "notes", hideAll: true },
  });
}

describe("seedCase", () => {
  it("new: a blank case that keeps the maps, players and layout", () => {
    const s = seedCase("new", current(), T);
    expect(s.rev).toBe(0);
    expect(s.case).toMatchObject({ title: "", number: "", mapIds: ["london"], players: [{ id: "p1", name: "Ann" }], startedAt: T });
    expect([s.trail, s.characters, s.keys, s.notes]).toEqual([[], [], [], []]);
    expect(s.overlay).toMatchObject({ layoutId: "corner", focus: "map", hideAll: false });
  });

  it("duplicate: keeps the cast, clears the trail", () => {
    const s = seedCase("duplicate", current(), T);
    expect(s.case.title).toBe("The Tin Soldier (copy)");
    expect(s.characters.map((c) => c.name)).toEqual(["Mrs. Example"]);
    expect([s.trail, s.keys, s.notes]).toEqual([[], [], []]);
    expect(s.newspaper).toMatchObject({ paperId: "p3", opened: false });
    expect(s.scoring).toEqual({ series1: null, series2: null, holmesLeads: null, freeStepIds: [] });
  });

  it("next in campaign: carries cast and pinned notes forward, empty trail and keys, numbered on", () => {
    const s = seedCase("next", current(), T);
    expect(s.case).toMatchObject({ title: "", number: "4", box: "Thames Murders", campaignId: "thames-murders" });
    expect(s.characters).toHaveLength(1);
    expect(s.notes).toEqual([expect.objectContaining({ id: "n1", text: "pinned", stepIds: [], characterIds: ["c1"] })]);
    expect([s.trail, s.keys]).toEqual([[], []]);
    expect(s.newspaper.paperId).toBeNull();
  });

  it("keeps an existing campaign id", () => {
    const c = current();
    c.case.campaignId = "irregulars";
    expect(seedCase("next", c, T).case.campaignId).toBe("irregulars");
  });
});

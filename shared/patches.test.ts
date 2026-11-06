import { describe, expect, it } from "vitest";
import { Action } from "./actions";

// A patch changes only the fields it names. Schemas built with .partial() from
// fields that have defaults fill those defaults in, which silently resets them
// (moving a zone used to clear its district and make it visitable again).

const onePatch: { action: Record<string, unknown>; field: string }[] = [
  { action: { type: "case/update", patch: { title: "The Tin Hat" } }, field: "title" },
  { action: { type: "zone/update", mapId: "london", zoneId: "z1", patch: { anchor: [0.5, 0.5] } }, field: "anchor" },
  { action: { type: "zone/update", mapId: "london", zoneId: "z1", patch: { points: [[0, 0], [1, 0], [1, 1]] } }, field: "points" },
  { action: { type: "zone/update", mapId: "london", zoneId: "z1", patch: { label: "14" } }, field: "label" },
  { action: { type: "trail/update", stepId: "s1", patch: { note: "rang the bell" } }, field: "note" },
  { action: { type: "character/update", characterId: "c1", patch: { name: "Mrs. Example" } }, field: "name" },
  { action: { type: "key/update", letter: "A", patch: { unlocked: true } }, field: "unlocked" },
  { action: { type: "note/update", noteId: "n1", patch: { text: "A clue" } }, field: "text" },
  { action: { type: "paper/update", paperId: "paper-01", patch: { title: "The Times" } }, field: "title" },
  { action: { type: "newspaper/update", patch: { opened: true } }, field: "opened" },
  { action: { type: "scoring/update", patch: { series1: 10 } }, field: "series1" },
  { action: { type: "overlay/configure", patch: { hideMap: true } }, field: "hideMap" },
];

describe("update patches", () => {
  it.each(onePatch)("$action.type with only $field changes only $field", ({ action, field }) => {
    const parsed = Action.parse(action) as { patch: Record<string, unknown> };
    expect(Object.keys(parsed.patch)).toEqual([field]);
  });
});

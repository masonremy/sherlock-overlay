// Starting another case from the current one: blank, duplicate, or the next
// case of a campaign (which carries the cast and pinned notes forward).

import { slugify } from "./geometry";
import { CaseState } from "./schema";

export type CaseSeed = "new" | "duplicate" | "next";

export function seedCase(kind: CaseSeed, from: CaseState, startedAt: string): CaseState {
  const fresh = CaseState.parse({ case: { startedAt } });
  // Setup that belongs to the streamer rather than the case.
  const base: CaseState = {
    ...fresh,
    case: { ...fresh.case, mapIds: from.case.mapIds, players: from.case.players, box: from.case.box, timesheet: from.case.timesheet },
    overlay: { ...fresh.overlay, layoutId: from.overlay.layoutId, mapView: from.overlay.mapView, reducedMotion: from.overlay.reducedMotion },
  };

  if (kind === "new") return base;

  if (kind === "duplicate") {
    return {
      ...base,
      case: { ...base.case, title: from.case.title ? `${from.case.title} (copy)` : "", number: from.case.number, paperDate: from.case.paperDate },
      characters: from.characters,
      newspaper: { ...base.newspaper, paperId: from.newspaper.paperId },
    };
  }

  const n = Number(from.case.number);
  return {
    ...base,
    case: {
      ...base.case,
      number: Number.isInteger(n) && from.case.number.trim() ? String(n + 1) : "",
      campaignId: from.case.campaignId ?? (slugify(from.case.box || from.case.title) || "campaign"),
    },
    characters: from.characters,
    // Pinned notes carry over; their step links don't (the trail starts empty).
    notes: from.notes.filter((n) => n.pinned).map((n) => ({ ...n, stepIds: [] })),
  };
}

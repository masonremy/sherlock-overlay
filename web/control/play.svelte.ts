// Panel-local UI state shared by the map panel and the trail tab. Nothing here
// syncs: the panel's private browsing never reaches the overlay (except through
// mirror mode, which streams the view separately).

import type { NoteFilter } from "../lib/notes";

export type RecordTarget =
  | { kind: "append" }
  | { kind: "insert"; index: number }
  | { kind: "replace"; stepId: string };

export type Tab = "trail" | "cast" | "keys" | "notes" | "paper" | "case" | "overlay" | "layout";
export const TABS: Tab[] = ["trail", "notes", "cast", "keys", "paper", "case", "overlay", "layout"];

export class PlayState {
  /** Tab under the map. */
  tab = $state<Tab>("trail");
  /** Notes tab filter (set by clicking a character, place or step). */
  noteFilter = $state<NoteFilter>(null);
  /** The step just recorded, so a note typed next can offer to link to it. */
  lastRecorded = $state<{ stepId: string; n: number; place: string; at: number } | null>(null);
  /** Offer "Link to step N?" after a quick note. */
  suggestStepLinks = $state(true);
  /** Bumped to focus the quick-note box (N). */
  quickNoteFocus = $state(0);

  /** Map shown in the panel. */
  mapId = $state<string | null>(null);
  /** Selected zone on the panel map: what Record would commit. */
  selected = $state<string | null>(null);
  /** Where the next recorded step goes. */
  target = $state<RecordTarget>({ kind: "append" });
  /** Edit mode in the Trail tab (also implied by a staged draft). */
  editing = $state(false);
  /** Edit without staging: changes go straight to the overlay. */
  liveEdit = $state(false);
  /** A request for the map to pan to a zone; seq makes repeats count. */
  focusRequest = $state<{ mapId: string; zoneId: string; seq: number } | null>(null);

  showZone(mapId: string, zoneId: string, select = true) {
    this.mapId = mapId;
    if (select) this.selected = zoneId;
    this.focusRequest = { mapId, zoneId, seq: (this.focusRequest?.seq ?? 0) + 1 };
  }

  resetTarget() {
    this.target = { kind: "append" };
  }

  showNotes(filter: NoteFilter) {
    this.noteFilter = filter;
    this.tab = "notes";
  }
}

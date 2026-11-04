import type { Action } from "./actions";
import { describeAction } from "./describe";
import { reduce } from "./reducer";
import type { AppState } from "./schema";

// Undo/redo over whole snapshots. `rev` only ever increases, including on undo
// and redo, so clients can always tell a newer snapshot from an older one.

export const HISTORY_LIMIT = 200;

/** A state plus what produced it, for the history drawer. */
export interface Entry {
  state: AppState;
  label: string;
  at: string;
}

export interface History {
  present: Entry;
  past: Entry[];
  future: Entry[];
}

export interface Timeline {
  /** Oldest first: past, present, then undone (future) entries. */
  entries: { label: string; at: string }[];
  /** Position of the present entry. */
  index: number;
}

export function createHistory(state: AppState, at: string, label = "Opened case"): History {
  return { present: { state, label, at }, past: [], future: [] };
}

function withRev(entry: Entry, rev: number): Entry {
  return { ...entry, state: { ...entry.state, rev } };
}

export function apply(h: History, action: Action, at: string): History {
  const prev = h.present.state;
  const state = { ...reduce(prev, action), rev: prev.rev + 1 };
  return {
    present: { state, label: describeAction(action, prev), at },
    past: [...h.past, h.present].slice(-HISTORY_LIMIT),
    future: [],
  };
}

export function undo(h: History): History {
  return jump(h, -1);
}

export function redo(h: History): History {
  return jump(h, 1);
}

/** Moves `offset` entries back (negative) or forward as one change. */
export function jump(h: History, offset: number): History {
  const all = [...h.past, h.present, ...h.future];
  const from = h.past.length;
  const to = Math.min(all.length - 1, Math.max(0, from + offset));
  if (to === from) return h;
  // Stored entries keep their original rev; the new present gets a fresh one.
  return {
    present: withRev(all[to], h.present.state.rev + 1),
    past: all.slice(0, to),
    future: all.slice(to + 1),
  };
}

export function timeline(h: History): Timeline {
  const entries = [...h.past, h.present, ...h.future].map(({ label, at }) => ({ label, at }));
  return { entries, index: h.past.length };
}

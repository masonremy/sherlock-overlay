import type { Action } from "./actions";
import { reduce } from "./reducer";
import type { AppState } from "./schema";

// Undo/redo over whole snapshots. `rev` only ever increases, including on undo
// and redo, so clients can always tell a newer snapshot from an older one.

export const HISTORY_LIMIT = 200;

export interface History {
  present: AppState;
  past: AppState[];
  future: AppState[];
}

export function createHistory(state: AppState): History {
  return { present: state, past: [], future: [] };
}

function withRev(state: AppState, rev: number): AppState {
  return { ...state, rev };
}

export function apply(h: History, action: Action): History {
  const next = withRev(reduce(h.present, action), h.present.rev + 1);
  return { present: next, past: [...h.past, h.present].slice(-HISTORY_LIMIT), future: [] };
}

export function undo(h: History): History {
  const prev = h.past.at(-1);
  if (!prev) return h;
  return {
    present: withRev(prev, h.present.rev + 1),
    past: h.past.slice(0, -1),
    future: [h.present, ...h.future],
  };
}

export function redo(h: History): History {
  const [next, ...rest] = h.future;
  if (!next) return h;
  return {
    present: withRev(next, h.present.rev + 1),
    past: [...h.past, h.present].slice(-HISTORY_LIMIT),
    future: rest,
  };
}

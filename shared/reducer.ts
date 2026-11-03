import type { Action } from "./actions";
import type { CaseState } from "./schema";

// Pure: never mutates `state`, never touches `rev` (history.ts owns rev).
export function reduce(state: CaseState, action: Action): CaseState {
  switch (action.type) {
    case "case/setTitle":
      return { ...state, case: { ...state.case, title: action.title } };
    case "debug/ping":
      return state;
  }
}

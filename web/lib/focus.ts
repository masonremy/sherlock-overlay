// The focus area shows one item at a time; the toolkit switches between them.

import type { ActionInput } from "../../shared/actions";

export type FocusItem = "map" | "newspaper" | "notes" | "verdict";
export type ToolItem = Exclude<FocusItem, "verdict">;

/** Toolkit buttons and Ctrl+1/2/3: select an item, or dismiss it if it's already in focus. */
export function focusAction(current: FocusItem, target: FocusItem): ActionInput | null {
  if (target !== current) return { type: "overlay/setFocus", focus: target };
  return target === "map" ? null : { type: "overlay/returnFocus" };
}

/** Items on the toolkit bar; the newspaper appears once the case has one. The verdict is shown from the Case tab. */
export function toolkitItems(paperId: string | null): ToolItem[] {
  return paperId ? ["map", "newspaper", "notes"] : ["map", "notes"];
}

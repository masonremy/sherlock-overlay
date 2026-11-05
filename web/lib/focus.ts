// The focus area shows one item at a time; the toolkit switches between them.

import type { ActionInput } from "../../shared/actions";

export type FocusItem = "map" | "newspaper" | "notes" | "verdict" | "card" | "directory" | "informants";
export type ToolItem = Exclude<FocusItem, "verdict" | "card">;
export type DocItem = "directory" | "informants";

/** Toolkit buttons and Ctrl+1–5: select an item, or dismiss it if it's already in focus. */
export function focusAction(current: FocusItem, target: FocusItem): ActionInput | null {
  if (target !== current) return { type: "overlay/setFocus", focus: target };
  return target === "map" ? null : { type: "overlay/returnFocus" };
}

/**
 * Items on the toolkit bar: the newspaper once the case has one, the directory
 * and informants when their PDFs are in artifacts/. The verdict is shown from the Case tab.
 */
export function toolkitItems(paperId: string | null, docs: readonly DocItem[] = []): ToolItem[] {
  const items: ToolItem[] = paperId ? ["map", "newspaper", "notes"] : ["map", "notes"];
  for (const d of ["directory", "informants"] as const) if (docs.includes(d)) items.push(d);
  return items;
}

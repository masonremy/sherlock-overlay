import { z } from "zod";

// Every state change is an action. The server validates incoming actions with
// this schema before handing them to the reducer.

export const Action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("case/setTitle"), title: z.string().max(200) }),
  // Changes nothing but still bumps rev; used to check sync end to end.
  z.object({ type: z.literal("debug/ping") }),
]);

export type Action = z.infer<typeof Action>;

export type ParseResult = { ok: true; action: Action } | { ok: false; error: string };

export function parseAction(raw: unknown): ParseResult {
  const result = Action.safeParse(raw);
  if (result.success) return { ok: true, action: result.data };
  return { ok: false, error: z.prettifyError(result.error) };
}

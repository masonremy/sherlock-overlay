import { z } from "zod";
import type { CaseState } from "./schema";

// Messages over the single WebSocket at /ws.

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("action"), action: z.unknown() }),
  z.object({ type: z.literal("undo") }),
  z.object({ type: z.literal("redo") }),
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

export type ServerMessage =
  | { type: "snapshot"; rev: number; state: CaseState; canUndo: boolean; canRedo: boolean }
  | { type: "error"; message: string };

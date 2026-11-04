import { z } from "zod";
import type { Timeline } from "./history";
import type { AppState } from "./schema";

// Messages over the single WebSocket at /ws.

/** The panel map's visible area, streamed to the overlay in mirror mode. */
export const MirrorView = z.object({
  mapId: z.string(),
  /** x0, y0, x1, y1, normalised to the map image. */
  rect: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});
export type MirrorView = z.infer<typeof MirrorView>;

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("action"), action: z.unknown() }),
  z.object({ type: z.literal("undo") }),
  z.object({ type: z.literal("redo") }),
  z.object({ type: z.literal("jump"), offset: z.number().int() }),
  // Transient: relayed to every client, never stored or undoable.
  z.object({ type: z.literal("mirror"), view: MirrorView }),
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

export type ServerMessage =
  | { type: "snapshot"; rev: number; state: AppState; history: Timeline }
  | { type: "mirror"; view: MirrorView }
  | { type: "error"; message: string };

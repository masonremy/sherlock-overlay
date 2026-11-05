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

/**
 * What a document shows on stream: the page, the visible part of it, the
 * search being highlighted and the match being pointed at. Live like mirror
 * mode: relayed to every client, the latest per document kept, never undoable.
 */
export const ReaderView = z.object({
  doc: z.string().min(1).max(80),
  page: z.number().int().min(1).max(2000),
  /** Visible box x0, y0, x1, y1 on the page (0–1); null shows the whole page width. */
  rect: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
  query: z.string().max(120),
  active: z.object({ page: z.number().int(), line: z.number().int(), start: z.number().int(), end: z.number().int() }).nullable(),
});
export type ReaderView = z.infer<typeof ReaderView>;

/** Presentation cues for the overlay (replay or skip an introduction). */
export const Cue = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("intro"), characterId: z.string() }),
  z.object({ kind: z.literal("skipIntro") }),
]);
export type Cue = z.infer<typeof Cue>;

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("action"), action: z.unknown() }),
  z.object({ type: z.literal("undo") }),
  z.object({ type: z.literal("redo") }),
  z.object({ type: z.literal("jump"), offset: z.number().int() }),
  // Transient: relayed to every client, never stored or undoable.
  z.object({ type: z.literal("mirror"), view: MirrorView }),
  z.object({ type: z.literal("cue"), cue: Cue }),
  // Compact notes strip scroll position, 0 (top) to 1 (bottom).
  z.object({ type: z.literal("notesScroll"), value: z.number().min(0).max(1) }),
  z.object({ type: z.literal("reader"), view: ReaderView }),
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

export type ServerMessage =
  | { type: "snapshot"; rev: number; caseId: string; state: AppState; history: Timeline }
  | { type: "mirror"; view: MirrorView }
  | { type: "cue"; cue: Cue }
  | { type: "notesScroll"; value: number }
  | { type: "reader"; view: ReaderView }
  | { type: "error"; message: string };

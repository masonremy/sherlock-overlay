import { z } from "zod";
import { ImageFile, ImageSize, MapDef, MapId, Zone, ZonePatch } from "./schema";

// Every state change is an action. The server validates incoming actions with
// this schema before handing them to the reducer; checks that depend on the
// current state (unknown ids, references) happen in the reducer.

export const Action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("case/setTitle"), title: z.string().max(200) }),
  // Changes nothing but still bumps rev; used to check sync end to end.
  z.object({ type: z.literal("debug/ping") }),

  // Case ↔ map library
  z.object({ type: z.literal("case/addMap"), mapId: MapId }),
  z.object({ type: z.literal("case/removeMap"), mapId: MapId }),

  // Map definitions. create and import also add the map to the current case.
  z.object({
    type: z.literal("map/create"),
    map: z.object({ id: MapId, name: z.string().trim().min(1).max(80), image: ImageFile, imageSize: ImageSize }),
  }),
  z.object({ type: z.literal("map/import"), map: MapDef, replace: z.boolean() }),
  z.object({ type: z.literal("map/rename"), mapId: MapId, name: z.string().trim().min(1).max(80) }),
  z.object({ type: z.literal("map/setImage"), mapId: MapId, image: ImageFile, imageSize: ImageSize }),
  z.object({ type: z.literal("map/delete"), mapId: MapId }),

  // Zones
  z.object({ type: z.literal("zone/add"), mapId: MapId, zone: Zone }),
  z.object({ type: z.literal("zone/update"), mapId: MapId, zoneId: z.string(), patch: ZonePatch }),
  z.object({ type: z.literal("zone/delete"), mapId: MapId, zoneId: z.string() }),
]);

export type Action = z.infer<typeof Action>;
/** What clients send: the schema's input type, so defaulted fields may be left out. */
export type ActionInput = z.input<typeof Action>;

export type ParseResult = { ok: true; action: Action } | { ok: false; error: string };

export function parseAction(raw: unknown): ParseResult {
  const result = Action.safeParse(raw);
  if (result.success) return { ok: true, action: result.data };
  return { ok: false, error: z.prettifyError(result.error) };
}

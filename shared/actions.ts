import { z } from "zod";
import { ImageFile, ImageSize, MapDef, MapId, MapView, StepKind, Zone, ZonePatch } from "./schema";

const StepId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Step id: letters, digits, - and _");
const customLabel = z
  .string()
  .trim()
  .max(80)
  .nullable()
  .transform((s) => s || null);

// A recorded step: on a map (mapId + zoneId) or off-map (customLabel).
const StepInput = z.object({
  id: StepId,
  mapId: MapId.nullable().default(null),
  zoneId: z.string().nullable().default(null),
  customLabel: customLabel.default(null),
  kind: StepKind.default("lead"),
  note: z.string().max(500).default(""),
  at: z.string().max(40),
});

const StepPatch = z
  .object({
    mapId: MapId.nullable(),
    zoneId: z.string().nullable(),
    customLabel,
    kind: StepKind,
    note: z.string().max(500),
    characterIds: z.array(z.string()),
  })
  .partial()
  .strict();

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

  // Trail. While a draft exists (edit mode), these change the draft instead.
  z.object({ type: z.literal("trail/add"), step: StepInput, index: z.number().int().min(0).optional() }),
  z.object({ type: z.literal("trail/update"), stepId: z.string(), patch: StepPatch }),
  z.object({ type: z.literal("trail/delete"), stepId: z.string() }),
  z.object({ type: z.literal("trail/move"), stepId: z.string(), toIndex: z.number().int().min(0) }),
  z.object({ type: z.literal("trail/beginEdit") }),
  z.object({ type: z.literal("trail/apply") }),
  z.object({ type: z.literal("trail/discard") }),

  // Overlay
  z.object({ type: z.literal("overlay/setMapView"), mode: MapView }),
  z.object({ type: z.literal("overlay/setMap"), mapId: MapId.nullable() }),
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

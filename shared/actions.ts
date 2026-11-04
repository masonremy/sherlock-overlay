import { z } from "zod";
import {
  Cameo,
  CharacterStatus,
  FocusItem,
  ImageFile,
  ImageSize,
  Letter,
  LibraryPortrait,
  MapDef,
  MapId,
  MapView,
  NoteTag,
  OverlayState,
  PlaceRef,
  PortraitFile,
  PortraitId,
  StepKind,
  Zone,
  ZonePatch,
} from "./schema";

const CharacterId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Character id: letters, digits, - and _");

// Written out twice (with and without defaults) because a partial schema built
// from defaulted fields would fill in defaults on every patch.
const characterFields = {
  name: z.string().trim().min(1, "Name is required").max(60),
  role: z.string().trim().max(60),
  status: CharacterStatus,
  portrait: PortraitFile.nullable(),
  cameo: Cameo.nullable(),
  address: PlaceRef.nullable(),
  notes: z.string().max(2000),
  hidden: z.boolean(),
};

const NewCharacter = z.object({
  id: CharacterId,
  name: characterFields.name,
  role: characterFields.role.default(""),
  status: characterFields.status.default("witness"),
  portrait: characterFields.portrait.default(null),
  cameo: characterFields.cameo.default(null),
  address: characterFields.address.default(null),
  notes: characterFields.notes.default(""),
  hidden: characterFields.hidden.default(false),
});

const CharacterPatch = z.object(characterFields).partial().strict();

// Notes: text may hold @[characterId] and #[mapId/zoneId] mention tokens; the
// link arrays are the source of truth for what a note is linked to.
const noteFields = {
  text: z.string().trim().min(1, "A note needs some text").max(2000),
  tag: NoteTag.nullable(),
  pinned: z.boolean(),
  hidden: z.boolean(),
  stepIds: z.array(z.string()).max(50),
  characterIds: z.array(z.string()).max(50),
  places: z.array(PlaceRef).max(50),
};

const NewNote = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Note id: letters, digits, - and _"),
  text: noteFields.text,
  tag: noteFields.tag.default(null),
  pinned: noteFields.pinned.default(false),
  hidden: noteFields.hidden.default(false),
  stepIds: noteFields.stepIds.default([]),
  characterIds: noteFields.characterIds.default([]),
  places: noteFields.places.default([]),
});

const NotePatch = z.object(noteFields).partial().strict();

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

  // Characters. add can link the new character to a step in the same change.
  z.object({ type: z.literal("character/add"), character: NewCharacter, stepId: z.string().optional() }),
  z.object({ type: z.literal("character/update"), characterId: z.string(), patch: CharacterPatch }),
  z.object({ type: z.literal("character/delete"), characterId: z.string() }),

  // Letter keys (Baker Street Irregulars), addressed by their letter.
  z.object({
    type: z.literal("key/add"),
    letter: Letter,
    unlocked: z.boolean().default(false),
    stepId: z.string().nullable().default(null),
  }),
  z.object({
    type: z.literal("key/update"),
    letter: z.string(),
    patch: z
      .object({ letter: Letter, unlocked: z.boolean(), unlockedAtStep: z.string().nullable(), note: z.string().max(300) })
      .partial()
      .strict(),
  }),
  z.object({ type: z.literal("key/delete"), letter: z.string() }),

  // Portrait library
  z.object({ type: z.literal("portrait/add"), portrait: LibraryPortrait }),
  z.object({ type: z.literal("portrait/update"), portraitId: PortraitId, tags: LibraryPortrait.shape.tags }),
  z.object({ type: z.literal("portrait/delete"), portraitId: PortraitId }),

  // Notes. New notes go on top, so the list reads newest first.
  z.object({ type: z.literal("note/add"), note: NewNote, index: z.number().int().min(0).optional() }),
  z.object({ type: z.literal("note/update"), noteId: z.string(), patch: NotePatch }),
  z.object({ type: z.literal("note/delete"), noteId: z.string() }),
  z.object({ type: z.literal("note/move"), noteId: z.string(), toIndex: z.number().int().min(0) }),

  // Overlay
  z.object({ type: z.literal("overlay/setFocus"), focus: FocusItem }),
  z.object({ type: z.literal("overlay/returnFocus") }),
  z.object({
    type: z.literal("overlay/configure"),
    patch: z
      .object({
        hideAll: z.boolean(),
        hideMap: z.boolean(),
        notesGroup: OverlayState.shape.notesGroup.unwrap(),
        noteRings: z.boolean(),
        notesAutoScroll: z.boolean(),
      })
      .partial()
      .strict(),
  }),
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

import { z } from "zod";

// Case state schema (DESIGN.md "Data model"). Every field has a default so that
// older or partial state files load cleanly: parsing doubles as migration.

const id = z.string().min(1);
const nullableString = z.string().nullable().default(null);

export const StepKind = z.enum(["lead", "free", "reread", "deadEnd"]);
export const CharacterStatus = z.enum(["suspect", "witness", "ally", "victim", "cleared"]);
export const NoteTag = z.enum(["clue", "question", "theory"]);
export const FocusItem = z.enum(["map", "newspaper", "notes"]);
export const MapView = z.enum(["full", "auto-frame", "mirror"]);

export const PlaceRef = z.object({ mapId: id, zoneId: id });

export const CaseInfo = z.object({
  title: z.string().default(""),
  mapIds: z.array(id).default([]),
  campaignId: nullableString,
  paperDate: nullableString,
  players: z.array(z.object({ id, name: z.string() })).default([]),
  timesheet: z.boolean().default(false),
  startedAt: nullableString,
});

export const TrailStep = z.object({
  id,
  mapId: nullableString,
  zoneId: nullableString,
  kind: StepKind.default("lead"),
  customLabel: nullableString,
  note: z.string().default(""),
  characterIds: z.array(id).default([]),
  by: nullableString,
  clock: nullableString,
  at: z.string(),
});

export const Character = z.object({
  id,
  name: z.string(),
  role: z.string().default(""),
  portrait: nullableString,
  status: CharacterStatus.default("witness"),
  address: PlaceRef.nullable().default(null),
  notes: z.string().default(""),
  hidden: z.boolean().default(false),
});

export const LetterKey = z.object({
  letter: z.string().min(1),
  unlocked: z.boolean().default(false),
  unlockedAtStep: nullableString,
  note: z.string().default(""),
});

export const Note = z.object({
  id,
  text: z.string(),
  tag: NoteTag.nullable().default(null),
  pinned: z.boolean().default(false),
  hidden: z.boolean().default(false),
  stepIds: z.array(id).default([]),
  characterIds: z.array(id).default([]),
  places: z.array(PlaceRef).default([]),
});

const Rect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

export const Newspaper = z.object({
  image: nullableString,
  showing: z.string().default("self"),
  zoom: Rect.nullable().default(null),
  opened: z.boolean().default(false),
});

export const Scoring = z.object({
  series1: z.number().nullable().default(null),
  series2: z.number().nullable().default(null),
  holmesLeads: z.number().int().nullable().default(null),
  freeStepIds: z.array(id).default([]),
});

export const OverlayState = z.object({
  layoutId: z.string().default("full"),
  focus: FocusItem.default("map"),
  focusPrev: FocusItem.default("map"),
  mapView: MapView.default("auto-frame"),
  notesScroll: z.number().default(0),
  notesAutoScroll: z.boolean().default(true),
});

export const CaseState = z.object({
  rev: z.number().int().nonnegative().default(0),
  case: CaseInfo.prefault({}),
  trail: z.array(TrailStep).default([]),
  characters: z.array(Character).default([]),
  keys: z.array(LetterKey).default([]),
  notes: z.array(Note).default([]),
  newspaper: Newspaper.prefault({}),
  scoring: Scoring.prefault({}),
  overlay: OverlayState.prefault({}),
});

export type CaseState = z.infer<typeof CaseState>;
export type TrailStep = z.infer<typeof TrailStep>;
export type Character = z.infer<typeof Character>;
export type LetterKey = z.infer<typeof LetterKey>;
export type Note = z.infer<typeof Note>;

export function createInitialState(startedAt: string = new Date().toISOString()): CaseState {
  return CaseState.parse({ case: { startedAt } });
}

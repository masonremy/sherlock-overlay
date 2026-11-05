import { z } from "zod";
import { COMPONENTS, DEFAULT_LAYOUT } from "./layout";

// Case state schema (DESIGN.md "Data model"). Every field has a default so that
// older or partial state files load cleanly: parsing doubles as migration.

const id = z.string().min(1);
const nullableString = z.string().nullable().default(null);

export const StepKind = z.enum(["lead", "free", "reread", "deadEnd"]);
export const CharacterStatus = z.enum(["suspect", "witness", "ally", "victim", "cleared"]);
export const NoteTag = z.enum(["clue", "question", "theory"]);
export const FocusItem = z.enum(["map", "newspaper", "notes", "verdict"]);
export const MapView = z.enum(["full", "auto-frame", "mirror"]);

export const PlaceRef = z.object({ mapId: id, zoneId: id });

/** A calendar date as the game prints it on papers, stored YYYY-MM-DD. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const CaseInfo = z.object({
  title: z.string().default(""),
  /** Case number as printed ("3"), shown before the title. */
  number: z.string().default(""),
  /** Box / set name, shown in small caps under the title. */
  box: z.string().default(""),
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
  /** Timesheet mode: the lead's stated duration in minutes. */
  duration: z.number().int().min(0).max(1440).nullable().default(null),
  at: z.string(),
});

// Portraits live in portraits/ as p-<hash>.<ext>; the name is all a character stores.
export const PortraitFile = z.string().regex(/^p-[0-9a-f]{16}\.(png|jpg|webp)$/, "Not a portrait file name");

/** A silhouette built from parts, used whenever there's no uploaded portrait. */
export const Cameo = z.object({
  head: z.number().int().min(0).max(3),
  top: z.enum(["bare", "tophat", "bowler", "bonnet", "helmet", "bun"]),
  face: z.enum(["none", "moustache", "beard"]),
});

export const Character = z.object({
  id,
  name: z.string(),
  role: z.string().default(""),
  portrait: PortraitFile.nullable().default(null),
  cameo: Cameo.nullable().default(null),
  status: CharacterStatus.default("witness"),
  address: PlaceRef.nullable().default(null),
  notes: z.string().default(""),
  hidden: z.boolean().default(false),
});

/** A letter (or short code) as the game prints it: "A", "B", "12". */
export const Letter = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{1,3}$/, "A key is 1–3 letters or digits");

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

/** A normalised (0–1) box on an image. */
export const NormRect = z
  .object({ x: z.number().min(0), y: z.number().min(0), w: z.number().gt(0), h: z.number().gt(0) })
  .refine((r) => r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001, "Box must lie within the image");

export const Newspaper = z.object({
  /** The case's own paper (an id in the paper library). */
  paperId: nullableString,
  /** Paper open on the overlay; null means the case's own. */
  showing: nullableString,
  /** Zoomed-in article box, remembered between openings. */
  zoom: NormRect.nullable().default(null),
  /** Opened at least once this case (clears the toolkit dot). */
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
  /** Map shown in the focus area; null follows the trail's latest map. */
  mapId: nullableString,
  /** Panic switch: the overlay draws nothing at all. */
  hideAll: z.boolean().default(false),
  /** Hide just the map (e.g. while reading a spoiler-sensitive paragraph). */
  hideMap: z.boolean().default(false),
  /** How the expanded notes view groups notes. */
  notesGroup: z.enum(["tag", "step"]).default("tag"),
  /** Faint rings on the map for places named in notes but not yet visited. */
  noteRings: z.boolean().default(true),
  /** Outline every layout box on stream, for setting up before going live. */
  showGuides: z.boolean().default(false),
  /** Swap animations for quick fades. */
  reducedMotion: z.boolean().default(false),
  /** Aged-paper grain and inked edges on panels (off: flat colour, cheaper on the GPU). */
  textures: z.boolean().default(true),
});

export const CaseState = z.object({
  rev: z.number().int().nonnegative().default(0),
  case: CaseInfo.prefault({}),
  trail: z.array(TrailStep).default([]),
  /** Staged trail edits (edit mode); viewers keep seeing `trail` until applied. */
  trailDraft: z.array(TrailStep).nullable().default(null),
  characters: z.array(Character).default([]),
  keys: z.array(LetterKey).default([]),
  notes: z.array(Note).default([]),
  newspaper: Newspaper.prefault({}),
  scoring: Scoring.prefault({}),
  overlay: OverlayState.prefault({}),
});

export type CaseState = z.infer<typeof CaseState>;

// --- Map definitions (maps/<id>.json), shared by every case ---------------

// Map ids become file names, so: lowercase (Windows is case-insensitive), no paths.
export const MapId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, "Map id: lowercase letters, digits, - and _");
export const ImageFile = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(png|jpe?g|webp)$/i, "Image must be a .png, .jpg or .webp file name");
const ZoneId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, "Zone id: letters, digits, - and _");
const unit = z.number().min(0).max(1);
export const NormPoint = z.tuple([unit, unit]);

export const ZoneFields = z.object({
  id: ZoneId,
  label: z.string().trim().min(1, "Label is required").max(60),
  district: z.string().max(30).default(""),
  shape: z.enum(["rect", "polygon"]),
  points: z.array(NormPoint).min(3, "A zone needs at least 3 points").max(500),
  anchor: NormPoint,
  visitable: z.boolean().default(true),
});

export const Zone = ZoneFields.superRefine((zone, ctx) => {
  if (zone.shape === "rect" && zone.points.length !== 4) {
    ctx.addIssue({ code: "custom", message: "A rectangle has exactly 4 points", path: ["points"] });
  }
});

export const ZonePatch = ZoneFields.omit({ id: true }).partial().strict();

export const ImageSize = z.tuple([z.number().int().positive(), z.number().int().positive()]);

export const Informant = z.object({ id: z.string().min(1).max(40), name: z.string().trim().min(1).max(60), zoneId: z.string() });
export type Informant = z.infer<typeof Informant>;

// Loose so fields added by later versions (informants, adjacency) survive a load/save.
export const MapDef = z
  .looseObject({
    id: MapId,
    name: z.string().max(80).default(""),
    image: ImageFile,
    imageSize: ImageSize,
    zones: z.array(Zone).default([]),
    /** Recurring helpers at fixed addresses (Scotland Yard, the medical examiner…). */
    informants: z.array(Informant).max(60).default([]),
    /** Timesheet mode: which areas (districts) border which. */
    adjacency: z.record(z.string(), z.array(z.string())).default({}),
  })
  .superRefine((map, ctx) => {
    const seen = new Set<string>();
    for (const zone of map.zones) {
      if (seen.has(zone.id)) ctx.addIssue({ code: "custom", message: `Duplicate zone id "${zone.id}"`, path: ["zones"] });
      seen.add(zone.id);
    }
  });

export type Zone = z.infer<typeof Zone>;
export type ZonePatch = z.infer<typeof ZonePatch>;
export type MapDef = z.infer<typeof MapDef>;

// --- Portrait library (portraits/library.json), shared by every case ------

export const PortraitId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Portrait id: letters, digits, - and _");

export const LibraryPortrait = z.object({
  id: PortraitId,
  file: PortraitFile,
  /** Loose descriptions for picking: "older man", "maid", "constable". */
  tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
});

export type LibraryPortrait = z.infer<typeof LibraryPortrait>;

// --- Newspaper library (papers/library.json), shared by every case --------

export const PaperId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Paper id: letters, digits, - and _");
export const Paper = z.object({
  id: PaperId,
  file: z.string().regex(/^np-[0-9a-f]{16}\.(png|jpg|webp)$/, "Not a newspaper file name"),
  /** Date printed on the paper; earlier-dated papers are fair game for later cases. */
  date: IsoDate.nullable().default(null),
  title: z.string().trim().max(80).default(""),
});
export type Paper = z.infer<typeof Paper>;

// --- Layouts (layouts.json) and theme (theme.json), global -----------------

export const ComponentId = z.enum(COMPONENTS);
export type ComponentId = z.infer<typeof ComponentId>;
export const LayoutId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, "Layout id: lowercase letters, digits, - and _");

const px = z.number().int().min(-1920).max(3840);
export const LayoutRect = z.object({
  x: px,
  y: px,
  w: z.number().int().min(16).max(3840),
  h: z.number().int().min(16).max(3840),
  z: z.number().int().min(0).max(99).default(1),
  visible: z.boolean().default(true),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
});
export type LayoutRect = z.infer<typeof LayoutRect>;

/** An empty, named area kept clear for another tool's overlay (alerts, chat…). */
export const ReservedBox = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().max(40).default(""),
  x: px,
  y: px,
  w: z.number().int().min(16).max(3840),
  h: z.number().int().min(16).max(3840),
});

export const Layout = z.object({
  id: LayoutId,
  name: z.string().trim().max(40).default(""),
  // Missing components (older files) take the default layout's box.
  components: z
    .object({
      header: LayoutRect.prefault(DEFAULT_LAYOUT.header),
      focus: LayoutRect.prefault(DEFAULT_LAYOUT.focus),
      cast: LayoutRect.prefault(DEFAULT_LAYOUT.cast),
      keys: LayoutRect.prefault(DEFAULT_LAYOUT.keys),
      notes: LayoutRect.prefault(DEFAULT_LAYOUT.notes),
      toolkit: LayoutRect.prefault(DEFAULT_LAYOUT.toolkit),
    })
    .prefault({}),
  reserved: z.array(ReservedBox).max(20).default([]),
});
export type Layout = z.infer<typeof Layout>;

/** Per-component font overrides; null inherits the master font. */
export const FontStyle = z.object({
  display: z.string().max(80).nullable().default(null),
  body: z.string().max(80).nullable().default(null),
  scale: z.number().min(0.5).max(2).default(1),
  weight: z.number().int().min(100).max(900).nullable().default(null),
  /** In em. */
  letterSpacing: z.number().min(-0.1).max(0.5).default(0),
});
export type FontStyle = z.infer<typeof FontStyle>;

export const Theme = z.object({
  display: z.string().max(80).default("IM Fell English"),
  body: z.string().max(80).default("Source Sans 3"),
  components: z.partialRecord(ComponentId, FontStyle).default({}),
});
export type Theme = z.infer<typeof Theme>;

// --- Server state: the case plus the global libraries ---------------------

// Maps and portraits travel with the case in every snapshot (and share its
// undo history), but are saved to maps/ and portraits/ rather than into the
// case's state.json.
export const AppState = CaseState.extend({
  maps: z.record(MapId, MapDef).default({}),
  portraits: z.record(PortraitId, LibraryPortrait).default({}),
  papers: z.record(PaperId, Paper).default({}),
  layouts: z.record(LayoutId, Layout).default({}),
  theme: Theme.prefault({}),
});

export type AppState = z.infer<typeof AppState>;
export type TrailStep = z.infer<typeof TrailStep>;
export type Character = z.infer<typeof Character>;
export type Cameo = z.infer<typeof Cameo>;
export type LetterKey = z.infer<typeof LetterKey>;
export type Note = z.infer<typeof Note>;

export function createInitialState(startedAt: string = new Date().toISOString()): AppState {
  return AppState.parse({ case: { startedAt } });
}

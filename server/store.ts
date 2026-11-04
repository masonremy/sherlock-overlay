import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseAction } from "../shared/actions";
import { seedCase, type CaseSeed } from "../shared/cases";
import { slugify, uniqueId } from "../shared/geometry";
import { apply, createHistory, jump, timeline, type History, type Timeline } from "../shared/history";
import { DEFAULT_LAYOUT } from "../shared/layout";
import { ActionError } from "../shared/reducer";
import { AppState, CaseState, Layout, LibraryPortrait, MapDef, MapId, Paper, Theme, createInitialState } from "../shared/schema";

// Owns the authoritative state: the current case plus the global libraries
// (maps, portraits, papers, layouts, theme). Applies actions, keeps the undo
// stack, and (debounced) writes cases/<id>/state.json and whichever global
// files changed. Can switch to another case at runtime.

type Listener = (state: AppState) => void;
export type DispatchResult = { ok: true } | { ok: false; error: string };

export interface StoreOptions {
  casesDir: string;
  mapsDir: string;
  portraitsDir: string;
  /** Defaults to <data>/papers, where <data> is the folder holding casesDir. */
  papersDir?: string;
  /** Defaults to <data>/layouts.json. */
  layoutsFile?: string;
  /** Defaults to <data>/theme.json. */
  themeFile?: string;
  caseId: string;
  debounceMs?: number;
  /** Minimum time between rolling backups (state.<rev>.json). */
  backupIntervalMs?: number;
  maxBackups?: number;
}

export interface CaseSummary {
  id: string;
  title: string;
  number: string;
  box: string;
  campaignId: string | null;
  startedAt: string | null;
  steps: number;
}

// Global state kept in one JSON file each (maps are a folder of files, handled apart).
type GlobalKey = "portraits" | "papers" | "layouts" | "theme";
const GLOBAL_KEYS: GlobalKey[] = ["portraits", "papers", "layouts", "theme"];

const parseGlobal: { [K in GlobalKey]: (raw: unknown) => AppState[K] } = {
  portraits: (raw) => byId(raw, (p, id) => LibraryPortrait.parse({ ...p, id })),
  papers: (raw) => byId(raw, (p, id) => Paper.parse({ ...p, id })),
  layouts: (raw) => byId(raw, (l, id) => Layout.parse({ ...l, id })),
  theme: (raw) => Theme.parse(raw),
};
const emptyGlobal: { [K in GlobalKey]: () => AppState[K] } = {
  portraits: () => ({}),
  papers: () => ({}),
  // The design's "full" preset until the streamer saves their own.
  layouts: () => ({ full: Layout.parse({ id: "full", name: "Full board", components: DEFAULT_LAYOUT }) }),
  theme: () => Theme.parse({}),
};

function byId<T>(raw: unknown, parse: (value: object, id: string) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, value] of Object.entries(raw as Record<string, object>)) out[id] = parse(value, id);
  return out;
}

export class AppStore {
  private history: History;
  private listeners = new Set<Listener>();
  private saveTimer: NodeJS.Timeout | null = null;
  private saving: Promise<void> = Promise.resolve();
  /** Map objects as last written (or loaded), to write only what changed. */
  private savedMaps: Record<string, MapDef>;
  private savedGlobals: Pick<AppState, GlobalKey>;
  private lastBackupAt = 0;

  private constructor(
    private readonly opts: Required<StoreOptions>,
    initial: AppState,
    /** Map ids whose files exist but couldn't be read; set aside before any write. */
    private readonly unreadableMaps: Set<string>,
    /** Global files that exist but couldn't be read; set aside before the first write. */
    private readonly unreadableGlobals: Set<GlobalKey>,
  ) {
    this.history = createHistory(initial, new Date().toISOString());
    this.savedMaps = initial.maps;
    this.savedGlobals = pickGlobals(initial);
  }

  static async load(options: StoreOptions): Promise<AppStore> {
    const data = dirname(options.casesDir);
    const opts: Required<StoreOptions> = {
      debounceMs: 500,
      backupIntervalMs: 60_000,
      maxBackups: 20,
      papersDir: join(data, "papers"),
      layoutsFile: join(data, "layouts.json"),
      themeFile: join(data, "theme.json"),
      ...options,
    };
    for (const dir of [join(opts.casesDir, opts.caseId, "assets"), opts.mapsDir, opts.portraitsDir, opts.papersDir]) {
      await mkdir(dir, { recursive: true });
    }
    const caseState = await readCaseState(join(opts.casesDir, opts.caseId));
    const { maps, unreadable } = await readMaps(opts.mapsDir);
    const unreadableGlobals = new Set<GlobalKey>();
    const globals = {} as Pick<AppState, GlobalKey>;
    for (const key of GLOBAL_KEYS) {
      const read = await readGlobal(globalFile(opts, key), key);
      (globals as Record<GlobalKey, unknown>)[key] = read.value;
      if (read.unreadable) unreadableGlobals.add(key);
    }
    return new AppStore(opts, { ...caseState, maps, ...globals }, unreadable, unreadableGlobals);
  }

  get caseId(): string {
    return this.opts.caseId;
  }

  get state(): AppState {
    return this.history.present.state;
  }

  get timeline(): Timeline {
    return timeline(this.history);
  }

  get canUndo(): boolean {
    return this.history.past.length > 0;
  }

  get canRedo(): boolean {
    return this.history.future.length > 0;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(raw: unknown): DispatchResult {
    const parsed = parseAction(raw);
    if (!parsed.ok) return parsed;
    try {
      this.commit(apply(this.history, parsed.action, new Date().toISOString()));
    } catch (err) {
      if (err instanceof ActionError) return { ok: false, error: err.message };
      throw err;
    }
    return { ok: true };
  }

  undo(): void {
    this.jump(-1);
  }

  redo(): void {
    this.jump(1);
  }

  /** Rolls back (negative) or forward through history as one change. */
  jump(offset: number): void {
    this.commit(jump(this.history, offset));
  }

  /** Writes any pending change now. */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      this.queueSave();
    }
    await this.saving;
  }

  // --- Cases ------------------------------------------------------------------

  async listCases(): Promise<CaseSummary[]> {
    const out: CaseSummary[] = [];
    for (const entry of await readdir(this.opts.casesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const s = entry.name === this.caseId ? this.state : await readCaseState(join(this.opts.casesDir, entry.name), { quiet: true });
      if (!s) continue;
      out.push({
        id: entry.name,
        title: s.case.title,
        number: s.case.number,
        box: s.case.box,
        campaignId: s.case.campaignId,
        startedAt: s.case.startedAt,
        steps: s.trail.length,
      });
    }
    return out.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  }

  /** Saves the current case, then loads another. Undo history starts afresh. */
  async switchCase(caseId: string): Promise<void> {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(caseId)) throw new ActionError(`Not a valid case id: "${caseId}"`);
    await this.flush();
    const dir = join(this.opts.casesDir, caseId);
    await mkdir(join(dir, "assets"), { recursive: true });
    const caseState = await readCaseState(dir);
    this.opts.caseId = caseId;
    this.lastBackupAt = 0;
    const globals = { maps: this.state.maps, ...pickGlobals(this.state) };
    this.history = createHistory({ ...caseState, ...globals }, new Date().toISOString(), "Opened case");
    for (const fn of this.listeners) fn(this.state);
  }

  /** Starts a new case (blank, duplicate, next in campaign) and switches to it. */
  async createCase(kind: CaseSeed): Promise<string> {
    const now = new Date().toISOString();
    const seeded = seedCase(kind, this.state, now);
    const taken = (await readdir(this.opts.casesDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
    const label = [seeded.case.box, seeded.case.number, seeded.case.title].filter(Boolean).join(" ") || `case ${now.slice(0, 10)}`;
    const id = uniqueId(slugify(label).slice(0, 48) || "case", taken);
    const dir = join(this.opts.casesDir, id);
    await mkdir(join(dir, "assets"), { recursive: true });
    await writeJson(join(dir, "state.json"), seeded);
    await this.switchCase(id);
    return id;
  }

  private commit(next: History): void {
    if (next === this.history) return;
    this.history = next;
    this.scheduleSave();
    for (const fn of this.listeners) fn(next.present.state);
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.queueSave();
    }, this.opts.debounceMs);
  }

  private queueSave(): void {
    const snapshot = this.state;
    const caseId = this.caseId;
    this.saving = this.saving
      .then(() => this.save(snapshot, caseId))
      .catch((err) => console.error(`[store] failed to save:`, err));
  }

  private async save(snapshot: AppState, caseId: string): Promise<void> {
    const { maps, portraits, papers, layouts, theme, ...caseState } = snapshot;
    const caseDir = join(this.opts.casesDir, caseId);
    await writeJson(join(caseDir, "state.json"), caseState);
    if (Date.now() - this.lastBackupAt >= this.opts.backupIntervalMs) {
      this.lastBackupAt = Date.now();
      await writeJson(join(caseDir, `state.${caseState.rev}.json`), caseState);
      await pruneBackups(caseDir, this.opts.maxBackups);
    }

    const { mapsDir } = this.opts;
    for (const [id, map] of Object.entries(maps)) {
      if (map === this.savedMaps[id]) continue;
      if (this.unreadableMaps.delete(id)) await moveToTrash(mapsDir, id, ".broken.json");
      await writeJson(join(mapsDir, `${id}.json`), map);
    }
    for (const id of Object.keys(this.savedMaps)) {
      if (!maps[id]) await moveToTrash(mapsDir, id, ".json");
    }
    this.savedMaps = maps;

    const globals = { portraits, papers, layouts, theme };
    for (const key of GLOBAL_KEYS) {
      if (globals[key] === this.savedGlobals[key]) continue;
      const file = globalFile(this.opts, key);
      if (this.unreadableGlobals.delete(key)) {
        await rename(file, file.replace(/\.json$/, `.broken-${Date.now()}.json`));
      }
      await writeJson(file, globals[key]);
      (this.savedGlobals as Record<GlobalKey, unknown>)[key] = globals[key];
    }
  }
}

function pickGlobals(s: AppState): Pick<AppState, GlobalKey> {
  return { portraits: s.portraits, papers: s.papers, layouts: s.layouts, theme: s.theme };
}

function globalFile(opts: Required<StoreOptions>, key: GlobalKey): string {
  if (key === "portraits") return join(opts.portraitsDir, "library.json");
  if (key === "papers") return join(opts.papersDir, "library.json");
  return key === "layouts" ? opts.layoutsFile : opts.themeFile;
}

async function readGlobal<K extends GlobalKey>(file: string, key: K): Promise<{ value: AppState[K]; unreadable: boolean }> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return { value: emptyGlobal[key](), unreadable: false };
  }
  try {
    const value = parseGlobal[key](JSON.parse(text));
    // An emptied layouts file still needs one layout to show.
    if (key === "layouts" && !Object.keys(value as object).length) return { value: emptyGlobal[key](), unreadable: false };
    return { value, unreadable: false };
  } catch (err) {
    console.warn(`[store] skipping ${file}: could not be read (left untouched)`, err);
    return { value: emptyGlobal[key](), unreadable: true };
  }
}

async function readCaseState(dir: string): Promise<CaseState>;
async function readCaseState(dir: string, opts: { quiet: true }): Promise<CaseState | null>;
async function readCaseState(dir: string, opts?: { quiet: true }): Promise<CaseState | null> {
  const file = join(dir, "state.json");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    if (opts?.quiet) return null;
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return createInitialState();
    throw err;
  }
  try {
    return CaseState.parse(JSON.parse(text));
  } catch (err) {
    // Listing only peeks; recovery happens when the case is actually opened.
    if (opts?.quiet) return null;
    // Keep the unreadable file for recovery rather than overwriting it.
    const aside = join(dir, `state.corrupt-${Date.now()}.json`);
    await rename(file, aside);
    console.error(`[store] ${file} could not be loaded; moved to ${aside}.`, err);
  }
  for (const backup of await listBackups(dir)) {
    try {
      const state = CaseState.parse(JSON.parse(await readFile(join(dir, backup.file), "utf8")));
      console.error(`[store] recovered from ${backup.file}`);
      return state;
    } catch {
      // try the next older one
    }
  }
  console.error("[store] no readable backup; starting fresh");
  return createInitialState();
}

/** Rolling backups, newest first. */
async function listBackups(dir: string): Promise<{ file: string; rev: number }[]> {
  return (await readdir(dir))
    .map((file) => ({ file, m: /^state\.(\d+)\.json$/.exec(file) }))
    .filter((b) => b.m)
    .map((b) => ({ file: b.file, rev: Number(b.m![1]) }))
    .sort((a, b) => b.rev - a.rev);
}

async function pruneBackups(dir: string, keep: number): Promise<void> {
  for (const old of (await listBackups(dir)).slice(keep)) await rm(join(dir, old.file), { force: true });
}

async function readMaps(mapsDir: string): Promise<{ maps: Record<string, MapDef>; unreadable: Set<string> }> {
  const maps: Record<string, MapDef> = {};
  const unreadable = new Set<string>();
  for (const entry of await readdir(mapsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const id = basename(entry.name, ".json");
    if (!MapId.safeParse(id).success) {
      console.warn(`[store] skipping maps/${entry.name}: file name is not a valid map id`);
      continue;
    }
    try {
      const raw = JSON.parse(await readFile(join(mapsDir, entry.name), "utf8"));
      // The file name is the id: a copied/renamed file must not clash with its source.
      maps[id] = MapDef.parse({ ...raw, id });
    } catch (err) {
      unreadable.add(id);
      console.warn(`[store] skipping maps/${entry.name}: could not be read (left untouched)`, err);
    }
  }
  return { maps, unreadable };
}

async function moveToTrash(mapsDir: string, id: string, suffix: string): Promise<void> {
  const trash = join(mapsDir, ".trash");
  await mkdir(trash, { recursive: true });
  try {
    await rename(join(mapsDir, `${id}.json`), join(trash, `${id}-${Date.now()}${suffix}`));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, stringify(value));
  await rename(tmp, file);
}

/** Pretty JSON, but short number arrays ([x, y] points) stay on one line. */
function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/\[\s+(-?[\d.e+-]+(?:,\s+-?[\d.e+-]+)*)\s+\]/g, (_m, inner: string) =>
    `[${inner.replace(/,\s+/g, ", ")}]`,
  );
}

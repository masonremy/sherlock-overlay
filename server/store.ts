import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseAction } from "../shared/actions";
import { apply, createHistory, jump, timeline, type History, type Timeline } from "../shared/history";
import { ActionError } from "../shared/reducer";
import { AppState, CaseState, MapDef, MapId, createInitialState } from "../shared/schema";

// Owns the authoritative state: the current case plus the map library. Applies
// actions, keeps the undo stack, and (debounced) writes cases/<id>/state.json
// and any changed maps/<id>.json.

type Listener = (state: AppState) => void;
export type DispatchResult = { ok: true } | { ok: false; error: string };

export interface StoreOptions {
  casesDir: string;
  mapsDir: string;
  caseId: string;
  debounceMs?: number;
  /** Minimum time between rolling backups (state.<rev>.json). */
  backupIntervalMs?: number;
  maxBackups?: number;
}

export class AppStore {
  private history: History;
  private listeners = new Set<Listener>();
  private saveTimer: NodeJS.Timeout | null = null;
  private saving: Promise<void> = Promise.resolve();
  /** Map objects as last written (or loaded), to write only what changed. */
  private savedMaps: Record<string, MapDef>;
  private lastBackupAt = 0;

  private constructor(
    private readonly opts: Required<StoreOptions>,
    initial: AppState,
    /** Map ids whose files exist but couldn't be read; set aside before any write. */
    private readonly unreadableMaps: Set<string>,
  ) {
    this.history = createHistory(initial, new Date().toISOString());
    this.savedMaps = initial.maps;
  }

  static async load(options: StoreOptions): Promise<AppStore> {
    const opts = { debounceMs: 500, backupIntervalMs: 60_000, maxBackups: 20, ...options };
    const caseDir = join(opts.casesDir, opts.caseId);
    await mkdir(join(caseDir, "assets"), { recursive: true });
    await mkdir(opts.mapsDir, { recursive: true });
    const caseState = await readCaseState(caseDir);
    const { maps, unreadable } = await readMaps(opts.mapsDir);
    return new AppStore(opts, { ...caseState, maps }, unreadable);
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
    this.saving = this.saving
      .then(() => this.save(snapshot))
      .catch((err) => console.error(`[store] failed to save:`, err));
  }

  private async save(snapshot: AppState): Promise<void> {
    const { maps, ...caseState } = snapshot;
    const caseDir = join(this.opts.casesDir, this.opts.caseId);
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
  }
}

async function readCaseState(dir: string): Promise<CaseState> {
  const file = join(dir, "state.json");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return createInitialState();
    throw err;
  }
  try {
    return CaseState.parse(JSON.parse(text));
  } catch (err) {
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

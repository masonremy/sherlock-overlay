import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseAction } from "../shared/actions";
import { apply, createHistory, redo, undo, type History } from "../shared/history";
import { CaseState, createInitialState } from "../shared/schema";

// Owns the authoritative state for one case: applies actions, keeps the undo
// stack and writes cases/<id>/state.json (debounced) on every change.

type Listener = (state: CaseState) => void;
export type DispatchResult = { ok: true } | { ok: false; error: string };

export interface StoreOptions {
  debounceMs?: number;
}

export class CaseStore {
  private history: History;
  private listeners = new Set<Listener>();
  private saveTimer: NodeJS.Timeout | null = null;
  private saving: Promise<void> = Promise.resolve();
  private readonly debounceMs: number;

  private constructor(
    readonly caseId: string,
    readonly dir: string,
    initial: CaseState,
    opts: StoreOptions,
  ) {
    this.history = createHistory(initial);
    this.debounceMs = opts.debounceMs ?? 500;
  }

  static async load(casesDir: string, caseId: string, opts: StoreOptions = {}): Promise<CaseStore> {
    const dir = join(casesDir, caseId);
    await mkdir(join(dir, "assets"), { recursive: true });
    return new CaseStore(caseId, dir, await readState(dir), opts);
  }

  get state(): CaseState {
    return this.history.present;
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
    this.commit(apply(this.history, parsed.action));
    return { ok: true };
  }

  undo(): void {
    this.commit(undo(this.history));
  }

  redo(): void {
    this.commit(redo(this.history));
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
    for (const fn of this.listeners) fn(next.present);
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.queueSave();
    }, this.debounceMs);
  }

  private queueSave(): void {
    const snapshot = this.state;
    this.saving = this.saving
      .then(() => writeState(this.dir, snapshot))
      .catch((err) => console.error(`[store] failed to save case "${this.caseId}":`, err));
  }
}

async function readState(dir: string): Promise<CaseState> {
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
    console.error(`[store] ${file} could not be loaded; moved to ${aside}. Starting fresh.`, err);
    return createInitialState();
  }
}

async function writeState(dir: string, state: CaseState): Promise<void> {
  const file = join(dir, "state.json");
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, file);
}

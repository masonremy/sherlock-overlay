import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppStore, type StoreOptions } from "./store";

let root: string;
let casesDir: string;
let mapsDir: string;
let portraitsDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "sherlock-store-"));
  casesDir = join(root, "cases");
  mapsDir = join(root, "maps");
  portraitsDir = join(root, "portraits");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const load = (caseId = "test", opts: Partial<StoreOptions> = {}) =>
  AppStore.load({ casesDir, mapsDir, portraitsDir, caseId, debounceMs: 10, ...opts });

const london = { id: "london", name: "London", image: "img-abc.png", imageSize: [4000, 2800] };
const zone = {
  id: "wc-14",
  label: "14 WC",
  shape: "rect",
  points: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]],
  anchor: [0.15, 0.15],
};

describe("AppStore: case state", () => {
  it("starts a fresh case when no file exists", async () => {
    const store = await load();
    expect(store.state.rev).toBe(0);
    expect(store.state.case.startedAt).toBeTruthy();
  });

  it("rejects invalid actions without changing state", async () => {
    const store = await load();
    expect(store.dispatch({ type: "bogus" }).ok).toBe(false);
    expect(store.state.rev).toBe(0);
  });

  it("reports reducer errors without changing state", async () => {
    const store = await load();
    const result = store.dispatch({ type: "case/addMap", mapId: "nope" });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/nope/) });
    expect(store.state.rev).toBe(0);
  });

  it("notifies subscribers on change", async () => {
    const store = await load();
    const revs: number[] = [];
    store.subscribe((s) => revs.push(s.rev));
    store.dispatch({ type: "debug/ping" });
    store.undo();
    store.redo();
    expect(revs).toEqual([1, 2, 3]);
  });

  it("persists state and reloads it after a restart", async () => {
    const a = await load();
    a.dispatch({ type: "case/setTitle", title: "Saved" });
    a.dispatch({ type: "debug/ping" });
    await a.flush();

    const b = await load();
    expect(b.state.rev).toBe(2);
    expect(b.state.case.title).toBe("Saved");
  });

  it("debounces writes", async () => {
    const store = await load("test", { debounceMs: 50 });
    store.dispatch({ type: "debug/ping" });
    await expect(readFile(join(casesDir, "test", "state.json"), "utf8")).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 120));
    const saved = JSON.parse(await readFile(join(casesDir, "test", "state.json"), "utf8"));
    expect(saved.rev).toBe(1);
  });

  it("does not write map definitions into the case file", async () => {
    const store = await load();
    store.dispatch({ type: "map/create", map: london });
    await store.flush();
    const saved = JSON.parse(await readFile(join(casesDir, "test", "state.json"), "utf8"));
    expect(saved.maps).toBeUndefined();
    expect(saved.case.mapIds).toEqual(["london"]);
  });

  it("fills in missing fields from older state files", async () => {
    await mkdir(join(casesDir, "old"), { recursive: true });
    await writeFile(join(casesDir, "old", "state.json"), JSON.stringify({ rev: 5, case: { title: "Old" } }));
    const store = await load("old");
    expect(store.state.rev).toBe(5);
    expect(store.state.case.title).toBe("Old");
    expect(store.state.trail).toEqual([]);
    expect(store.state.overlay.focus).toBe("map");
  });

  it("sets aside a corrupt file instead of overwriting it", async () => {
    await mkdir(join(casesDir, "bad"), { recursive: true });
    await writeFile(join(casesDir, "bad", "state.json"), "{ not json");
    const store = await load("bad");
    expect(store.state.rev).toBe(0);
    const files = await readdir(join(casesDir, "bad"));
    expect(files.some((f) => f.startsWith("state.corrupt-"))).toBe(true);
  });

  it("keeps rolling backups named by rev, newest N only", async () => {
    const store = await load("test", { backupIntervalMs: 0, maxBackups: 3 });
    for (let i = 0; i < 5; i++) {
      store.dispatch({ type: "debug/ping" });
      await store.flush();
    }
    const backups = (await readdir(join(casesDir, "test"))).filter((f) => /^state\.\d+\.json$/.test(f)).sort();
    expect(backups).toEqual(["state.3.json", "state.4.json", "state.5.json"]);
  });

  it("recovers from the newest readable backup when state.json is corrupt", async () => {
    const a = await load("test", { backupIntervalMs: 0 });
    a.dispatch({ type: "case/setTitle", title: "Before the crash" });
    await a.flush();
    await writeFile(join(casesDir, "test", "state.json"), "{ truncated");
    await writeFile(join(casesDir, "test", "state.99.json"), "also broken");

    const b = await load("test");
    expect(b.state.case.title).toBe("Before the crash");
    expect(b.state.rev).toBe(1);
  });

  it("jumps through history and reports the timeline", async () => {
    const store = await load();
    for (const title of ["A", "B", "C"]) store.dispatch({ type: "case/setTitle", title });
    store.jump(-2);
    expect(store.state.case.title).toBe("A");
    expect(store.timeline.index).toBe(1);
    expect(store.timeline.entries.map((e) => e.label)).toEqual([
      "Opened case",
      'Case title → "A"',
      'Case title → "B"',
      'Case title → "C"',
    ]);
  });
});

describe("AppStore: map definitions", () => {
  const readMap = async (id: string) => JSON.parse(await readFile(join(mapsDir, `${id}.json`), "utf8"));

  it("writes maps/<id>.json on change and loads it back in another case", async () => {
    const a = await load();
    a.dispatch({ type: "map/create", map: london });
    a.dispatch({ type: "zone/add", mapId: "london", zone });
    await a.flush();
    expect((await readMap("london")).zones[0].label).toBe("14 WC");

    const b = await load("another-case");
    expect(b.state.maps.london.zones).toHaveLength(1);
    expect(b.state.case.mapIds).toEqual([]);
  });

  it("only rewrites maps that changed", async () => {
    await mkdir(mapsDir, { recursive: true });
    const handWritten = `{"id":"other","image":"o.png","imageSize":[10,10],"zones":[]}`;
    await writeFile(join(mapsDir, "other.json"), handWritten);
    const store = await load();
    store.dispatch({ type: "map/create", map: london });
    await store.flush();
    expect(await readFile(join(mapsDir, "other.json"), "utf8")).toBe(handWritten);
  });

  it("moves a deleted map to .trash, and undo brings it back", async () => {
    const store = await load();
    store.dispatch({ type: "map/create", map: london });
    await store.flush();
    store.dispatch({ type: "map/delete", mapId: "london" });
    await store.flush();
    expect(await readdir(mapsDir)).not.toContain("london.json");
    expect((await readdir(join(mapsDir, ".trash"))).some((f) => f.startsWith("london-"))).toBe(true);

    store.undo();
    await store.flush();
    expect((await readMap("london")).id).toBe("london");
  });

  it("skips unreadable map files and never overwrites them in place", async () => {
    await mkdir(mapsDir, { recursive: true });
    await writeFile(join(mapsDir, "london.json"), "{ broken");
    const store = await load();
    expect(store.state.maps).toEqual({});

    store.dispatch({ type: "map/create", map: london });
    await store.flush();
    expect((await readMap("london")).name).toBe("London");
    const trash = await readdir(join(mapsDir, ".trash"));
    const aside = trash.find((f) => f.startsWith("london-") && f.endsWith(".broken.json"));
    expect(aside).toBeDefined();
    expect(await readFile(join(mapsDir, ".trash", aside!), "utf8")).toBe("{ broken");
  });

  it("uses the file name as the map id", async () => {
    await mkdir(mapsDir, { recursive: true });
    await writeFile(join(mapsDir, "whitechapel.json"), JSON.stringify({ ...london, id: "something-else", zones: [] }));
    const store = await load();
    expect(Object.keys(store.state.maps)).toEqual(["whitechapel"]);
    expect(store.state.maps.whitechapel.id).toBe("whitechapel");
  });
});

describe("AppStore: portrait library", () => {
  const portrait = { id: "p1", file: "p-0123456789abcdef.webp", tags: ["maid"] };

  it("saves the library to portraits/library.json and shares it across cases", async () => {
    const a = await load();
    a.dispatch({ type: "portrait/add", portrait });
    await a.flush();
    const saved = JSON.parse(await readFile(join(portraitsDir, "library.json"), "utf8"));
    expect(saved).toEqual({ p1: portrait });

    const b = await load("another-case");
    expect(b.state.portraits).toEqual({ p1: portrait });
  });

  it("does not write the library when it hasn't changed", async () => {
    const store = await load();
    store.dispatch({ type: "debug/ping" });
    await store.flush();
    await expect(readFile(join(portraitsDir, "library.json"), "utf8")).rejects.toThrow();
  });

  it("sets an unreadable library aside instead of overwriting it", async () => {
    await mkdir(portraitsDir, { recursive: true });
    await writeFile(join(portraitsDir, "library.json"), "{ broken");
    const store = await load();
    expect(store.state.portraits).toEqual({});
    store.dispatch({ type: "portrait/add", portrait });
    await store.flush();
    const files = await readdir(portraitsDir);
    expect(files.some((f) => /^library\.broken-\d+\.json$/.test(f))).toBe(true);
  });
});

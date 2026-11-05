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

describe("AppStore: layouts, theme and papers", () => {
  it("starts with the default full layout and theme without writing them", async () => {
    const store = await load();
    expect(Object.keys(store.state.layouts)).toEqual(["full"]);
    expect(store.state.theme.display).toBe("IM Fell English");
    store.dispatch({ type: "debug/ping" });
    await store.flush();
    await expect(readFile(join(root, "layouts.json"), "utf8")).rejects.toThrow();
    await expect(readFile(join(root, "theme.json"), "utf8")).rejects.toThrow();
  });

  it("saves layouts.json, theme.json and papers/library.json when they change, shared across cases", async () => {
    const a = await load();
    a.dispatch({ type: "layout/save", layout: { ...a.state.layouts.full, id: "corner", name: "Corner" } });
    a.dispatch({ type: "theme/set", theme: { display: "Special Elite", body: "Lato", components: {} } });
    a.dispatch({ type: "paper/add", paper: { id: "p1", file: "B_NEWSPAPER/Journal_01.pdf", date: "1889-03-14", title: "" } });
    await a.flush();
    expect(Object.keys(JSON.parse(await readFile(join(root, "layouts.json"), "utf8")))).toEqual(["full", "corner"]);
    expect(JSON.parse(await readFile(join(root, "theme.json"), "utf8")).display).toBe("Special Elite");
    expect(Object.keys(JSON.parse(await readFile(join(root, "papers", "library.json"), "utf8")))).toEqual(["p1"]);

    const b = await load("other");
    expect(Object.keys(b.state.layouts)).toEqual(["full", "corner"]);
    expect(b.state.theme.display).toBe("Special Elite");
    expect(b.state.papers.p1.date).toBe("1889-03-14");
  });
});

describe("AppStore: adopting the paper library at startup", () => {
  const pdf = (id: string, date: string) => ({ id, file: `B_NEWSPAPER/Journal_${id.slice(-2)}.pdf`, date, title: `Newspaper ${id.slice(-2)}` });

  it("replaces the library without an undo entry, saves it, and drops a case paper that's gone", async () => {
    const store = await load();
    store.dispatch({ type: "paper/add", paper: { id: "old", file: "B_NEWSPAPER/Old.pdf", date: null, title: "" } });
    store.dispatch({ type: "newspaper/update", patch: { paperId: "old" } });
    const before = store.state.rev;
    const fresh = await load(); // a restart: history starts clean
    fresh.adoptPapers({ "paper-01": pdf("paper-01", "1885-11-19") });
    expect(Object.keys(fresh.state.papers)).toEqual(["paper-01"]);
    expect(fresh.state.newspaper.paperId).toBeNull();
    expect(fresh.canUndo).toBe(false);
    await fresh.flush();
    expect(Object.keys(JSON.parse(await readFile(join(root, "papers", "library.json"), "utf8")))).toEqual(["paper-01"]);
    expect(before).toBeGreaterThan(0);
  });

  it("keeps the case's paper when it's still in the library", async () => {
    const store = await load();
    store.adoptPapers({ "paper-01": pdf("paper-01", "1885-11-19") });
    store.dispatch({ type: "newspaper/update", patch: { paperId: "paper-01" } });
    store.adoptPapers({ "paper-01": pdf("paper-01", "1885-11-19"), "paper-02": pdf("paper-02", "1885-11-21") });
    expect(store.state.newspaper.paperId).toBe("paper-01");
  });
});

describe("AppStore: cases", () => {
  it("creates a case from the current one, switches to it, and lists both", async () => {
    const store = await load("first");
    store.dispatch({ type: "case/update", patch: { title: "The Tin Soldier", number: "3", box: "Thames Murders" } });
    store.dispatch({ type: "character/add", character: { id: "c1", name: "Mrs. Example" } });
    const id = await store.createCase("next");
    expect(store.caseId).toBe(id);
    expect(id).toBe("thames-murders-4");
    expect(store.state.case.number).toBe("4");
    expect(store.state.characters.map((c) => c.name)).toEqual(["Mrs. Example"]);
    expect(store.canUndo).toBe(false);

    const cases = await store.listCases();
    expect(cases.map((c) => c.id).sort()).toEqual(["first", "thames-murders-4"]);

    await store.switchCase("first");
    expect(store.state.case.title).toBe("The Tin Soldier");
  });

  it("saves the case it was editing before switching away", async () => {
    const store = await load("first");
    store.dispatch({ type: "case/setTitle", title: "Unsaved" });
    await store.switchCase("second");
    const saved = JSON.parse(await readFile(join(casesDir, "first", "state.json"), "utf8"));
    expect(saved.case.title).toBe("Unsaved");
    expect(store.state.case.title).toBe("");
  });

  it("rejects case ids that aren't safe folder names", async () => {
    const store = await load();
    await expect(store.switchCase("../escape")).rejects.toThrow();
  });
});

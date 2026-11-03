import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CaseStore } from "./store";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sherlock-store-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("CaseStore", () => {
  it("starts a fresh case when no file exists", async () => {
    const store = await CaseStore.load(dir, "test");
    expect(store.state.rev).toBe(0);
    expect(store.state.case.startedAt).toBeTruthy();
  });

  it("rejects invalid actions without changing state", async () => {
    const store = await CaseStore.load(dir, "test");
    const result = store.dispatch({ type: "bogus" });
    expect(result.ok).toBe(false);
    expect(store.state.rev).toBe(0);
  });

  it("notifies subscribers on change", async () => {
    const store = await CaseStore.load(dir, "test");
    const revs: number[] = [];
    store.subscribe((s) => revs.push(s.rev));
    store.dispatch({ type: "debug/ping" });
    store.undo();
    store.redo();
    expect(revs).toEqual([1, 2, 3]);
  });

  it("persists state and reloads it after a restart", async () => {
    const a = await CaseStore.load(dir, "test", { debounceMs: 10 });
    a.dispatch({ type: "case/setTitle", title: "Saved" });
    a.dispatch({ type: "debug/ping" });
    await a.flush();

    const b = await CaseStore.load(dir, "test");
    expect(b.state.rev).toBe(2);
    expect(b.state.case.title).toBe("Saved");
  });

  it("debounces writes", async () => {
    const store = await CaseStore.load(dir, "test", { debounceMs: 50 });
    store.dispatch({ type: "debug/ping" });
    await expect(readFile(join(dir, "test", "state.json"), "utf8")).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 120));
    const saved = JSON.parse(await readFile(join(dir, "test", "state.json"), "utf8"));
    expect(saved.rev).toBe(1);
  });

  it("fills in missing fields from older state files", async () => {
    await mkdir(join(dir, "old"), { recursive: true });
    await writeFile(join(dir, "old", "state.json"), JSON.stringify({ rev: 5, case: { title: "Old" } }));
    const store = await CaseStore.load(dir, "old");
    expect(store.state.rev).toBe(5);
    expect(store.state.case.title).toBe("Old");
    expect(store.state.trail).toEqual([]);
    expect(store.state.overlay.focus).toBe("map");
  });

  it("sets aside a corrupt file instead of overwriting it", async () => {
    await mkdir(join(dir, "bad"), { recursive: true });
    await writeFile(join(dir, "bad", "state.json"), "{ not json");
    const store = await CaseStore.load(dir, "bad");
    expect(store.state.rev).toBe(0);
    const files = await readdir(join(dir, "bad"));
    expect(files.some((f) => f.startsWith("state.corrupt-"))).toBe(true);
  });
});

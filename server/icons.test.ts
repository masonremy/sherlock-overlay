import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listIcons } from "./icons";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sherlock-icons-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("listIcons", () => {
  it("finds a custom image per toolkit item by file name, with a cache-busting version", async () => {
    await writeFile(join(dir, "map.png"), "x");
    await writeFile(join(dir, "notes.svg"), "x");
    await writeFile(join(dir, "newspaper.webp"), "x");
    await writeFile(join(dir, "readme.txt"), "x");
    await writeFile(join(dir, "other.png"), "x");
    const icons = await listIcons(dir);
    expect(Object.keys(icons).sort()).toEqual(["map", "newspaper", "notes"]);
    expect(icons.map).toMatch(/^\/icons\/map\.png\?v=\d+$/);
    expect(icons.notes).toMatch(/^\/icons\/notes\.svg\?v=\d+$/);
  });

  it("covers the directory and informants too", async () => {
    await writeFile(join(dir, "directory.png"), "x");
    await writeFile(join(dir, "Informants.PNG"), "x");
    expect(Object.keys(await listIcons(dir)).sort()).toEqual(["directory", "informants"]);
  });

  it("returns nothing when the folder is missing or empty", async () => {
    expect(await listIcons(join(dir, "nope"))).toEqual({});
    expect(await listIcons(dir)).toEqual({});
  });
});

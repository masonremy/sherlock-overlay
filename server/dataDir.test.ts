import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LEGACY_ENTRIES, moveLegacyData } from "./dataDir";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "sherlock-data-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("moveLegacyData", () => {
  it("moves the old top-level data folders and files into data/, contents intact", async () => {
    await mkdir(join(root, "maps"));
    await writeFile(join(root, "maps", "london.json"), "{}");
    await mkdir(join(root, "artifacts", "B_NEWSPAPER"), { recursive: true });
    await writeFile(join(root, "artifacts", "B_NEWSPAPER", "Journal_01.pdf"), "pdf");
    await writeFile(join(root, "layouts.json"), "[]");
    const data = join(root, "data");

    const moved = await moveLegacyData(root, data);

    expect(moved.sort()).toEqual(["artifacts", "layouts.json", "maps"]);
    expect(await readFile(join(data, "maps", "london.json"), "utf8")).toBe("{}");
    expect(await readFile(join(data, "artifacts", "B_NEWSPAPER", "Journal_01.pdf"), "utf8")).toBe("pdf");
    expect(await readFile(join(data, "layouts.json"), "utf8")).toBe("[]");
    expect((await readdir(root)).sort()).toEqual(["data"]);
  });

  it("leaves both copies alone when data/ already has that entry", async () => {
    await mkdir(join(root, "maps"));
    await writeFile(join(root, "maps", "old.json"), "old");
    await mkdir(join(root, "data", "maps"), { recursive: true });
    await writeFile(join(root, "data", "maps", "new.json"), "new");

    expect(await moveLegacyData(root, join(root, "data"))).toEqual([]);
    expect(await readFile(join(root, "maps", "old.json"), "utf8")).toBe("old");
    expect(await readdir(join(root, "data", "maps"))).toEqual(["new.json"]);
  });

  it("does nothing when there's nothing to move, and only knows the data entries", async () => {
    await mkdir(join(root, "server"));
    await writeFile(join(root, "package.json"), "{}");
    expect(await moveLegacyData(root, join(root, "data"))).toEqual([]);
    expect((await readdir(root)).sort()).toEqual(["package.json", "server"]);
    expect(LEGACY_ENTRIES).not.toContain("server");
  });
});

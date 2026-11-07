// Where the streamer's data lives: everything that isn't code (the game's
// PDFs, maps and zones, portraits, icons, fonts, cases, layouts, theme) sits
// in one git-ignored data/ folder beside the code. Older copies kept these at
// the top level; they're moved in once, on start.

import { mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";

/** What used to sit at the top level and now belongs in data/. */
export const LEGACY_ENTRIES = ["artifacts", "cases", "maps", "portraits", "papers", "fonts", "icons", "layouts.json", "theme.json"] as const;

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/**
 * Moves each legacy entry from `root` into `dataDir` by renaming it. Never
 * deletes or overwrites: an entry already in dataDir is left alone (both
 * copies stay). Returns the names that moved.
 */
export async function moveLegacyData(root: string, dataDir: string): Promise<string[]> {
  const moved: string[] = [];
  for (const name of LEGACY_ENTRIES) {
    const from = join(root, name);
    const to = join(dataDir, name);
    if (!(await exists(from)) || (await exists(to))) continue;
    await mkdir(dataDir, { recursive: true });
    await rename(from, to);
    moved.push(name);
  }
  return moved;
}

/** Legacy entries still at the top level (not moved because data/ has its own). */
export async function leftoverLegacyData(root: string): Promise<string[]> {
  const left: string[] = [];
  for (const name of LEGACY_ENTRIES) if (await exists(join(root, name))) left.push(name);
  return left;
}

// Custom toolkit icons: the streamer's own artwork in icons/, named after the
// toolkit item (map.png, newspaper.webp, notes.svg…). Items without one keep
// the built-in SVG drawings.

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export const ICON_ITEMS = ["map", "newspaper", "notes", "directory", "informants"] as const;
export type IconItem = (typeof ICON_ITEMS)[number];
const FILE = /^(map|newspaper|notes|directory|informants)\.(png|jpe?g|webp|svg)$/i;

/** URL per item that has a custom icon; ?v changes when the file does, so a replaced image shows up. */
export async function listIcons(dir: string): Promise<Partial<Record<IconItem, string>>> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return {};
  }
  const out: Partial<Record<IconItem, string>> = {};
  for (const file of files.sort()) {
    const m = FILE.exec(file);
    if (!m) continue;
    const item = m[1].toLowerCase() as IconItem;
    const { mtimeMs } = await stat(join(dir, file));
    out[item] ??= `/icons/${encodeURIComponent(file)}?v=${Math.round(mtimeMs)}`;
  }
  return out;
}

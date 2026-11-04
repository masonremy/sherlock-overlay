import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export class UnsupportedImageError extends Error {}

export type ImageType = "png" | "jpg" | "webp";

/** Identifies an image by its leading bytes; the client's Content-Type isn't trusted. */
export function sniffImage(buf: Buffer): ImageType | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

/**
 * Saves a map image as maps/img-<hash>.<ext> and returns the file name. Names
 * are content-addressed, so replacing a map's image never overwrites the old
 * file and undo can switch back to it.
 */
export async function saveMapImage(mapsDir: string, buf: Buffer): Promise<string> {
  const type = sniffImage(buf);
  if (!type) throw new UnsupportedImageError("Not a PNG, JPG or WebP image");
  const name = `img-${createHash("sha256").update(buf).digest("hex").slice(0, 16)}.${type}`;
  const file = join(mapsDir, name);
  await mkdir(mapsDir, { recursive: true });
  try {
    await access(file);
  } catch {
    await writeFile(file, buf);
  }
  return name;
}

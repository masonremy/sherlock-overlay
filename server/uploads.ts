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
 * Saves an image as <dir>/<prefix>-<hash>.<ext> and returns the file name
 * (maps use "img", portraits "p"). Names are content-addressed, so replacing
 * an image never overwrites the old file and undo can switch back to it.
 */
export async function saveImage(dir: string, buf: Buffer, prefix: string): Promise<string> {
  const type = sniffImage(buf);
  if (!type) throw new UnsupportedImageError("Not a PNG, JPG or WebP image");
  const name = `${prefix}-${createHash("sha256").update(buf).digest("hex").slice(0, 16)}.${type}`;
  const file = join(dir, name);
  await mkdir(dir, { recursive: true });
  try {
    await access(file);
  } catch {
    await writeFile(file, buf);
  }
  return name;
}

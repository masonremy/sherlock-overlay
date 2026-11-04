// Fonts beyond the bundled set: files the streamer uploads, and Google Fonts
// downloaded once by name. Both are stored in fonts/ and listed in
// fonts/fonts.json, so they work offline from then on.

import { createHash } from "node:crypto";
import { readFile, rename, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type FontFormat = "ttf" | "otf" | "woff" | "woff2";
const CSS_FORMAT: Record<FontFormat, string> = { ttf: "truetype", otf: "opentype", woff: "woff", woff2: "woff2" };

export interface FontFile {
  file: string;
  format: string;
  weight: number;
  style: "normal" | "italic";
}

export interface FontEntry {
  family: string;
  source: "upload" | "google";
  files: FontFile[];
}

export class FontError extends Error {}

export function sniffFont(buf: Buffer): FontFormat | null {
  const head = buf.subarray(0, 4);
  if (head.equals(Buffer.from([0x00, 0x01, 0x00, 0x00])) || head.toString("latin1") === "true") return "ttf";
  if (head.toString("latin1") === "OTTO") return "otf";
  if (head.toString("latin1") === "wOFF") return "woff";
  if (head.toString("latin1") === "wOF2") return "woff2";
  return null;
}

const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 '-]{0,59}$/;

export async function listFonts(dir: string): Promise<FontEntry[]> {
  try {
    return JSON.parse(await readFile(join(dir, "fonts.json"), "utf8")) as FontEntry[];
  } catch {
    return [];
  }
}

async function addFiles(dir: string, family: string, source: FontEntry["source"], files: FontFile[]): Promise<FontEntry> {
  const fonts = await listFonts(dir);
  let entry = fonts.find((f) => f.family === family);
  if (!entry) fonts.push((entry = { family, source, files: [] }));
  for (const f of files) if (!entry.files.some((e) => e.file === f.file)) entry.files.push(f);
  const tmp = join(dir, "fonts.json.tmp");
  await writeFile(tmp, JSON.stringify(fonts, null, 2));
  await rename(tmp, join(dir, "fonts.json"));
  return entry;
}

async function store(dir: string, family: string, buf: Buffer, format: FontFormat): Promise<string> {
  await mkdir(dir, { recursive: true });
  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const file = `${slug}-${createHash("sha256").update(buf).digest("hex").slice(0, 10)}.${format}`;
  await writeFile(join(dir, file), buf);
  return file;
}

export async function saveUploadedFont(
  dir: string,
  buf: Buffer,
  family: string,
  weight = 400,
  style: FontFile["style"] = "normal",
): Promise<FontEntry> {
  if (!FAMILY.test(family)) throw new FontError("Font name: letters, digits, spaces, ' and -");
  const format = sniffFont(buf);
  if (!format) throw new FontError("Not a TTF, OTF, WOFF or WOFF2 font");
  const file = await store(dir, family, buf, format);
  return addFiles(dir, family, "upload", [{ file, format: CSS_FORMAT[format], weight, style }]);
}

/** Latin-subset faces from a Google Fonts css2 response. */
export function parseGoogleCss(css: string): { url: string; weight: number; style: "normal" | "italic" }[] {
  const out: { url: string; weight: number; style: "normal" | "italic" }[] = [];
  for (const m of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    if (m[1] !== "latin") continue;
    const body = m[2];
    const url = /url\(([^)]+)\)/.exec(body)?.[1];
    if (!url) continue;
    out.push({
      url: url.replace(/['"]/g, ""),
      weight: Number(/font-weight:\s*(\d+)/.exec(body)?.[1] ?? 400),
      style: /font-style:\s*italic/.test(body) ? "italic" : "normal",
    });
  }
  return out;
}

/** Downloads a Google Fonts family (regular, bold, italic where available) into fonts/. */
export async function downloadGoogleFont(dir: string, family: string): Promise<FontEntry> {
  if (!FAMILY.test(family)) throw new FontError("Font name: letters, digits, spaces, ' and -");
  const name = encodeURIComponent(family.trim()).replace(/%20/g, "+");
  // A modern browser user agent gets woff2 files back.
  const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" };
  let css: string | null = null;
  for (const axes of [":ital,wght@0,400;0,700;1,400", ":wght@400;700", ""]) {
    const res = await fetch(`https://fonts.googleapis.com/css2?family=${name}${axes}&display=swap`, { headers });
    if (res.ok) {
      css = await res.text();
      break;
    }
  }
  if (!css) throw new FontError(`Google Fonts has no family called "${family}"`);
  const faces = parseGoogleCss(css);
  if (!faces.length) throw new FontError(`No latin files found for "${family}"`);
  const files: FontFile[] = [];
  for (const face of faces) {
    const res = await fetch(face.url);
    if (!res.ok) throw new FontError(`Download failed (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    files.push({ file: await store(dir, family, buf, "woff2"), format: "woff2", weight: face.weight, style: face.style });
  }
  return addFiles(dir, family.trim(), "google", files);
}

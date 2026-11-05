// The streamer's PDFs in artifacts/: found at startup, their text read once
// with pdf.js and cached in artifacts/.index/ (keyed by file size and time),
// then served to the panel and overlay for rendering and search.

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { DocInfo, DocKind, DocText } from "../shared/docs";
import { classifyArtifact, directorySections, docIdFor, linesFromItems, parsePaperDate, type RawItem } from "./docText";

/** Kinds whose text is indexed and which can be opened on stream. */
const INDEXED: DocKind[] = ["newspaper", "directory", "informants"];

export interface DocLibrary {
  docs: DocInfo[];
  text: Map<string, DocText>;
}

interface CacheEntry {
  version: number;
  file: string;
  size: number;
  mtimeMs: number;
  info: DocInfo;
  text: DocText;
}
const CACHE_VERSION = 3;

async function findPdfs(dir: string, root = dir): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await findPdfs(full, root)));
    else if (/\.pdf$/i.test(e.name)) out.push(relative(root, full).split(sep).join("/"));
  }
  return out.sort();
}

function titleFor(kind: DocKind, id: string, rel: string): string {
  if (kind === "newspaper") return `Newspaper ${Number(id.replace(/\D/g, "")) || ""}`.trim();
  if (kind === "directory") return "Directory";
  if (kind === "informants") return "Informants";
  return rel.split("/").pop()!.replace(/\.pdf$/i, "");
}

async function extract(path: string, id: string, kind: DocKind, rel: string): Promise<{ info: DocInfo; text: DocText }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(await readFile(path)), verbosity: 0 });
  const doc = await task.promise;
  const text: DocText = { id, pages: [] };
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.filter((i) => "str" in i) as unknown as RawItem[];
    text.pages.push({ w: width, h: height, lines: linesFromItems(items, width, height) });
  }
  await task.destroy();
  const firstPage = text.pages[0]?.lines.map((l) => l.text).join(" ") ?? "";
  const info: DocInfo = {
    id,
    kind,
    title: titleFor(kind, id, rel),
    file: rel,
    pages: text.pages.length,
    date: kind === "newspaper" ? parsePaperDate(firstPage) : null,
    sections: kind === "directory" ? directorySections(text.pages) : [],
  };
  return { info, text };
}

/** Finds and indexes every PDF under artifacts/. Unreadable files are skipped with a warning. */
export async function loadDocs(artifactsDir: string): Promise<DocLibrary> {
  const cacheDir = join(artifactsDir, ".index");
  const docs: DocInfo[] = [];
  const text = new Map<string, DocText>();
  const taken = new Set<string>();

  for (const rel of await findPdfs(artifactsDir)) {
    const kind = classifyArtifact(rel);
    if (!INDEXED.includes(kind)) continue;
    let id = docIdFor(kind, rel);
    for (let n = 2; taken.has(id); n++) id = `${docIdFor(kind, rel)}-${n}`;
    taken.add(id);

    const path = join(artifactsDir, ...rel.split("/"));
    const { size, mtimeMs } = await stat(path);
    const cacheFile = join(cacheDir, `${id}.json`);
    let entry: CacheEntry | null = null;
    try {
      const cached = JSON.parse(await readFile(cacheFile, "utf8")) as CacheEntry;
      if (cached.version === CACHE_VERSION && cached.file === rel && cached.size === size && cached.mtimeMs === mtimeMs) entry = cached;
    } catch {
      // not cached yet
    }
    if (!entry) {
      try {
        const started = Date.now();
        const { info, text: t } = await extract(path, id, kind, rel);
        entry = { version: CACHE_VERSION, file: rel, size, mtimeMs, info, text: t };
        await mkdir(cacheDir, { recursive: true });
        await writeFile(cacheFile, JSON.stringify(entry));
        console.log(`[docs] indexed ${rel} (${info.pages} pages) in ${Date.now() - started} ms`);
      } catch (err) {
        console.warn(`[docs] skipping ${rel}: could not read its text`, err);
        continue;
      }
    }
    docs.push(entry.info);
    text.set(id, entry.text);
  }
  return { docs, text };
}

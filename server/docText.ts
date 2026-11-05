// Turning a PDF's text layer (pdf.js text runs) into searchable lines, and
// recognising what each of the box's PDFs is. Pure functions; docs.ts does
// the file reading.

import { slugify } from "../shared/geometry";
import type { DocInfo, DocKind, DocLine, DocPage, DocSection } from "../shared/docs";
import type { Paper } from "../shared/schema";

/** A pdf.js text item: transform is [a, b, c, d, x, baselineY], y up from the page bottom. */
export interface RawItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
}

interface Building {
  text: string;
  baseline: number;
  size: number;
  left: number;
  right: number;
  runs: { start: number; end: number; x: number; w: number }[];
  pendingSpace: boolean;
  /** Size of the last run: a drop cap and its entry share a baseline but not a size. */
  lastSize: number;
}

/**
 * Groups runs into lines (end-of-line marks, a baseline change, or a jump in
 * type size such as a drop cap), with boxes normalised to the page.
 */
export function linesFromItems(items: RawItem[], pageW: number, pageH: number): DocLine[] {
  const lines: DocLine[] = [];
  let cur: Building | null = null;

  const finish = () => {
    if (cur && cur.text.trim()) {
      const text = cur.text.trimEnd();
      lines.push({
        text,
        x: cur.left / pageW,
        y: (pageH - cur.baseline - cur.size * 0.85) / pageH,
        w: (cur.right - cur.left) / pageW,
        h: (cur.size * 1.1) / pageH,
        runs: cur.runs.map((r) => ({ start: r.start, end: Math.min(r.end, text.length), x: r.x / pageW, w: r.w / pageW })),
      });
    }
    cur = null;
  };

  for (const item of items) {
    const [a, b, , , x, y] = item.transform;
    const size = Math.hypot(a, b) || item.height;
    if (cur && Math.abs(y - cur.baseline) > Math.max(size, cur.size) * 0.5) finish();
    if (cur && item.str.trim() && Math.max(size, cur.lastSize) / Math.min(size, cur.lastSize) > 2.5) finish();
    if (item.str.trim()) {
      if (!cur) cur = { text: "", baseline: y, size, left: x, right: x, runs: [], pendingSpace: false, lastSize: size };
      const gap = x - cur.right;
      if (cur.text && (cur.pendingSpace || gap > size * 0.15) && !cur.text.endsWith(" ") && !item.str.startsWith(" ")) cur.text += " ";
      const start = cur.text.length;
      cur.text += item.str;
      cur.runs.push({ start, end: cur.text.length, x, w: item.width });
      cur.size = Math.max(cur.size, size);
      cur.left = Math.min(cur.left, x);
      cur.right = Math.max(cur.right, x + item.width);
      cur.pendingSpace = false;
      cur.lastSize = size;
    } else if (cur && item.str) {
      cur.pendingSpace = true;
    }
    if (item.hasEOL) finish();
  }
  finish();
  return lines;
}

export function classifyArtifact(relPath: string): DocKind {
  const p = relPath.toLowerCase();
  if (/newspaper|journal/.test(p)) return "newspaper";
  if (/directory|annuaire/.test(p)) return "directory";
  if (/informant|informateur/.test(p)) return "informants";
  if (/board|plan|map/.test(p)) return "map";
  return "other";
}

export function docIdFor(kind: DocKind, relPath: string): string {
  const base = relPath.split("/").pop()!.replace(/\.pdf$/i, "");
  if (kind === "newspaper") {
    const n = /journal[_\s-]*(\d+)/i.exec(base)?.[1] ?? [...base.matchAll(/\d+/g)].at(-1)?.[0] ?? "0";
    return `paper-${n.padStart(2, "0")}`;
  }
  if (kind === "directory" || kind === "informants") return kind;
  return slugify(base) || "document";
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** The masthead date ("LONDON, THURSDAY, NOVEMBER 19, 1885") as YYYY-MM-DD. */
export function parsePaperDate(text: string): string | null {
  const m = /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/i.exec(text);
  const month = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  if (!m || month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

const DOTTED = /\.{4,}/;

/**
 * Jump points in the directory: big single letters (alphabetical part, listed
 * A–Z) and category headings (in page order), found by size on pages that hold
 * dotted entries. A heading set on two lines is one heading; all-caps page
 * titles ("LIST BY CATEGORY") are not.
 */
export function directorySections(pages: DocPage[]): DocSection[] {
  const letters: DocSection[] = [];
  const categories: (DocSection & { x: number; h: number; bottom: number })[] = [];
  pages.forEach((page, i) => {
    if (!page.lines.some((l) => DOTTED.test(l.text))) return;
    const heights = page.lines.map((l) => l.h).sort((a, b) => a - b);
    const body = heights[Math.floor(heights.length / 4)];
    for (const l of page.lines) {
      const text = l.text.trim();
      if (l.h < body * 1.4 || DOTTED.test(text) || /^h?\s*\d+\s*h?$/.test(text)) continue;
      if (/^[A-Z]$/.test(text)) {
        letters.push({ label: text, page: i + 1, kind: "letter", y: l.y });
        continue;
      }
      if (/\s/.test(text) && text === text.toUpperCase()) continue;
      const above = categories.find((c) => c.page === i + 1 && Math.abs(c.x - l.x) < 0.15 && l.y > c.bottom && l.y - c.bottom < c.h * 1.6);
      if (above) {
        above.label += ` ${text}`;
        above.bottom = l.y;
      } else categories.push({ label: text, page: i + 1, kind: "category", y: l.y, x: l.x, h: l.h, bottom: l.y });
    }
  });
  letters.sort((a, b) => a.label.localeCompare(b.label));
  return [...letters, ...categories.map(({ label, page, kind, y }) => ({ label, page, kind, y }))];
}

/**
 * The paper library follows the newspaper PDFs: one entry per PDF, dated from
 * its masthead. Anything else (old placeholder images) drops out; dates and
 * titles the streamer changed are kept.
 */
export function reconcilePapers(existing: Record<string, Paper>, newspapers: DocInfo[]): Record<string, Paper> {
  const out: Record<string, Paper> = {};
  for (const doc of newspapers) {
    const prev = existing[doc.id];
    out[doc.id] = prev && prev.file === doc.file ? prev : { id: doc.id, file: doc.file, date: doc.date, title: doc.title };
  }
  return out;
}

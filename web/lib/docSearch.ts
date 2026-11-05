// Searching the documents' text and placing highlights. Matches are found
// within a line; boxes are normalised to the page like the text index.

import type { DocLine, DocText } from "../../shared/docs";
import type { MapDef } from "../../shared/schema";
import { zoneName } from "./trail";

/** Lower case, no accents, straight apostrophes and quotes: what search compares. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase();
}

export interface DocMatch {
  doc: string;
  /** 1-based page. */
  page: number;
  line: number;
  start: number;
  end: number;
  snippet: string;
}

/** Every occurrence of the query, by document (in the order given), page and line. */
export function searchDocs(docs: DocText[], query: string, limit = 500): DocMatch[] {
  const q = normalizeText(query.trim());
  if (q.length < 2) return [];
  const out: DocMatch[] = [];
  for (const doc of docs) {
    doc.pages.forEach((page, p) => {
      page.lines.forEach((line, l) => {
        const text = normalizeText(line.text);
        for (let i = text.indexOf(q); i >= 0 && out.length < limit; i = text.indexOf(q, i + q.length)) {
          out.push({ doc: doc.id, page: p + 1, line: l, start: i, end: i + q.length, snippet: line.text });
        }
      });
    });
  }
  return out;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Highlight boxes for characters [start, end) of a line: one per run touched, spaced by character within the run. */
export function matchRects(line: DocLine, start: number, end: number): Box[] {
  const out: Box[] = [];
  for (const r of line.runs) {
    const a = Math.max(start, r.start);
    const b = Math.min(end, r.end);
    if (a >= b) continue;
    const per = r.w / Math.max(1, r.end - r.start);
    out.push({ x: r.x + (a - r.start) * per, y: line.y, w: (b - a) * per, h: line.h });
  }
  return out;
}

export interface ActiveMatch {
  page: number;
  line: number;
  start: number;
  end: number;
}

/** Highlights on one page (1-based): every match of the query, and the active match on its own. */
export function pageHighlights(doc: DocText | null, page: number, query: string, active: ActiveMatch | null): { all: Box[]; active: Box[] } {
  const lines = doc?.pages[page - 1]?.lines;
  if (!lines) return { all: [], active: [] };
  const isActive = (m: { line: number; start: number }) => active?.page === page && active.line === m.line && active.start === m.start;
  const all = searchDocs([{ id: doc.id, pages: [doc.pages[page - 1]] }], query)
    .filter((m) => !isActive(m))
    .flatMap((m) => matchRects(lines[m.line], m.start, m.end));
  const line = active?.page === page ? lines[active.line] : undefined;
  return { all, active: line ? matchRects(line, active!.start, active!.end) : [] };
}

/** Whether the chosen result is still a match for the search (cleared or changed: it isn't). */
export function activeStillMatches(doc: DocText | null, active: ActiveMatch, query: string): boolean {
  const q = normalizeText(query.trim());
  const line = doc?.pages[active.page - 1]?.lines[active.line];
  return q.length >= 2 && !!line && normalizeText(line.text).slice(active.start, active.end) === q;
}

/**
 * A view rectangle [x0, y0, x1, y1] (page units) around a match: `width` of
 * the page wide, centred on the match, with the match a third of the way down.
 * `viewAspect` is the viewport's height/width, `pageAspect` the page's.
 */
export function viewAround(box: Box, width: number, viewAspect: number, pageAspect: number): [number, number, number, number] {
  const w = Math.min(1, width);
  const h = Math.min(1, (w * viewAspect) / pageAspect);
  const x0 = Math.min(1 - w, Math.max(0, box.x + box.w / 2 - w / 2));
  const y0 = Math.min(1 - h, Math.max(0, box.y - h / 3));
  return [x0, y0, x0 + w, y0 + h];
}

export interface Address {
  label: string;
  number: number;
  district: string;
}

/** The address a directory line ends with: "…22 WC", "…35 S", "…46 QP". */
export function addressIn(text: string): Address | null {
  const m = /(?:\.{2,}|\s)\s*(\d{1,3})\s+(NW|WC|EC|SW|SE|E|S|QP|N|W)\s*$/.exec(text.trim());
  return m ? { label: `${Number(m[1])} ${m[2]}`, number: Number(m[1]), district: m[2] } : null;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The zone labelled with this address on one of the maps, if it's been zoned. */
export function zoneForAddress(maps: MapDef[], address: Address): { mapId: string; zoneId: string } | null {
  const want = squash(address.label);
  for (const map of maps) {
    const zone = map.zones.find((z) => squash(zoneName(z)) === want);
    if (zone) return { mapId: map.id, zoneId: zone.id };
  }
  return null;
}

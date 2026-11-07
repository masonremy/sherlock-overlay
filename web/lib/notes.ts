// Notes helpers: quick-entry prefixes, @character / #place mention tokens,
// filtering and "leads to follow" rings. Shared by panel and overlay.

import type { Character, MapDef, Note, TrailStep } from "../../shared/schema";
import { zoneName } from "./trail";

export const TAG_LABELS: Record<NonNullable<Note["tag"]>, string> = {
  clue: "Clue",
  question: "Question",
  theory: "Theory",
};

/** Headings for groups of notes by tag. */
export const TAG_PLURALS: Record<NonNullable<Note["tag"]>, string> = {
  clue: "Clues",
  question: "Questions",
  theory: "Theories",
};

/** Quick entry: a leading "!" pins the note, "?" tags it as a question (either order). */
export function parseQuickNote(input: string): { text: string; pinned: boolean; tag: Note["tag"] } {
  const m = /^([!?]{1,2})\s*/.exec(input);
  const flags = m && new Set(m[1]).size === m[1].length ? m[1] : "";
  return {
    text: input.slice(flags ? m![0].length : 0).trim(),
    pinned: flags.includes("!"),
    tag: flags.includes("?") ? "question" : null,
  };
}

// Tokens stored in note text. Ids keep links stable when names change.
const CHAR_TOKEN = /@\[([^\]]+)\]/g;
const PLACE_TOKEN = /#\[([^/\]]+)\/([^\]]+)\]/g;
const ANY_TOKEN = /@\[([^\]]+)\]|#\[([^/\]]+)\/([^\]]+)\]/g;

export const charToken = (id: string) => `@[${id}]`;
export const placeToken = (mapId: string, zoneId: string) => `#[${mapId}/${zoneId}]`;

function zoneLabel(maps: Record<string, MapDef>, mapId: string, zoneId: string): string | null {
  const zone = maps[mapId]?.zones.find((z) => z.id === zoneId);
  return zone ? zoneName(zone) : null;
}

/** Text as people read and type it: tokens become "@Name" and "#14 WC". */
export function toDisplay(text: string, characters: Character[], maps: Record<string, MapDef>): string {
  return text
    .replace(CHAR_TOKEN, (_m, id: string) => `@${characters.find((c) => c.id === id)?.name ?? "?"}`)
    .replace(PLACE_TOKEN, (_m, mapId: string, zoneId: string) => `#${zoneLabel(maps, mapId, zoneId) ?? "?"}`);
}

/**
 * The reverse of toDisplay for the note's linked characters and places:
 * "@Mrs. Example" becomes "@[c1]". Unlinked "@words" stay plain text.
 */
export function fromDisplay(
  display: string,
  characters: Character[],
  maps: Record<string, MapDef>,
  characterIds: string[],
  places: { mapId: string; zoneId: string }[],
): string {
  const names: { label: string; token: string }[] = [];
  for (const id of characterIds) {
    const c = characters.find((x) => x.id === id);
    if (c) names.push({ label: `@${c.name}`, token: charToken(id) });
  }
  for (const p of places) {
    const label = zoneLabel(maps, p.mapId, p.zoneId);
    if (label) names.push({ label: `#${label}`, token: placeToken(p.mapId, p.zoneId) });
  }
  // Longest first, so "@Mrs. Example" wins over a shorter "@Mrs".
  names.sort((a, b) => b.label.length - a.label.length);
  let out = display;
  for (const { label, token } of names) out = out.split(label).join(token);
  return out;
}

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "character"; character: Character }
  | { kind: "place"; label: string; mapId: string; zoneId: string };

/** Note text split into plain runs and chips, for rendering. */
export function segments(text: string, characters: Character[], maps: Record<string, MapDef>): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(ANY_TOKEN)) {
    const plain = (s: string) => {
      const prev = out.at(-1);
      if (prev?.kind === "text") prev.text += s;
      else if (s) out.push({ kind: "text", text: s });
    };
    plain(text.slice(last, m.index));
    if (m[1]) {
      const character = characters.find((c) => c.id === m[1]);
      if (character) out.push({ kind: "character", character });
      else plain("@?");
    } else {
      const label = zoneLabel(maps, m[2], m[3]);
      if (label) out.push({ kind: "place", label, mapId: m[2], zoneId: m[3] });
      else plain("#?");
    }
    last = m.index + m[0].length;
  }
  const rest = text.slice(last);
  if (rest) {
    const prev = out.at(-1);
    if (prev?.kind === "text") prev.text += rest;
    else out.push({ kind: "text", text: rest });
  }
  return out;
}

/** Characters and places mentioned by tokens in a text, without duplicates. */
export function linksInText(text: string): { characterIds: string[]; places: { mapId: string; zoneId: string }[] } {
  const characterIds = [...new Set([...text.matchAll(CHAR_TOKEN)].map((m) => m[1]))];
  const seen = new Set<string>();
  const places: { mapId: string; zoneId: string }[] = [];
  for (const m of text.matchAll(PLACE_TOKEN)) {
    if (!seen.has(m[0])) places.push({ mapId: m[1], zoneId: m[2] });
    seen.add(m[0]);
  }
  return { characterIds, places };
}

/** The "@query" or "#query" being typed just before the caret, for autocomplete. */
export function mentionAt(text: string, caret: number): { kind: "@" | "#"; query: string; start: number } | null {
  const m = /(^|\s)([@#])([^\s@#]*)$/.exec(text.slice(0, caret));
  if (!m) return null;
  return { kind: m[2] as "@" | "#", query: m[3], start: caret - m[3].length - 1 };
}

export type NoteFilter =
  | { kind: "character"; id: string }
  | { kind: "place"; mapId: string; zoneId: string }
  | { kind: "step"; id: string }
  | null;

export function filterNotes(notes: Note[], filter: NoteFilter): Note[] {
  if (!filter) return notes;
  return notes.filter((n) => {
    if (filter.kind === "character") return n.characterIds.includes(filter.id);
    if (filter.kind === "step") return n.stepIds.includes(filter.id);
    return n.places.some((p) => p.mapId === filter.mapId && p.zoneId === filter.zoneId);
  });
}

/** What viewers may see: pinned and not hidden. */
export const isOnStream = (n: Note) => n.pinned && !n.hidden;

/** Zones on a map named in on-stream notes but not yet visited: "leads to follow". */
export function noteRingZones(notes: Note[], trail: TrailStep[], mapId: string): string[] {
  const visited = new Set(trail.filter((t) => t.mapId === mapId).map((t) => t.zoneId));
  const zones = new Set<string>();
  for (const n of notes) {
    if (!isOnStream(n)) continue;
    for (const p of n.places) if (p.mapId === mapId && !visited.has(p.zoneId)) zones.add(p.zoneId);
  }
  return [...zones];
}

/** A link picked from @/# autocomplete. */
export type MentionLink = { characterId: string } | { place: { mapId: string; zoneId: string } };

/**
 * Mentions typed out in full without using autocomplete: "@Lestrade" or
 * "#13 SW" exactly matching a character name or zone label (not followed by
 * more letters or digits).
 */
export function autoLinks(
  display: string,
  characters: Character[],
  caseMaps: MapDef[],
): { characterIds: string[]; places: { mapId: string; zoneId: string }[] } {
  const present = (label: string) => {
    let i = display.indexOf(label);
    while (i >= 0) {
      if (!/[A-Za-z0-9]/.test(display[i + label.length] ?? "")) return true;
      i = display.indexOf(label, i + 1);
    }
    return false;
  };
  const labelCount = new Map<string, number>();
  for (const z of caseMaps.flatMap((m) => m.zones)) labelCount.set(z.label, (labelCount.get(z.label) ?? 0) + 1);
  return {
    characterIds: characters.filter((c) => present(`@${c.name}`)).map((c) => c.id),
    // "#1 EC" by full name; a bare "#22 WC" or "#9" only when no other zone has that label.
    places: caseMaps.flatMap((m) =>
      m.zones
        .filter((z) => present(`#${zoneName(z)}`) || (labelCount.get(z.label) === 1 && present(`#${z.label}`)))
        .map((z) => ({ mapId: m.id, zoneId: z.id })),
    ),
  };
}

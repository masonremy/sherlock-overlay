// Pure helpers for characters and letter keys, shared by panel and overlay.

import type { Cameo, Character, LetterKey, MapDef, TrailStep, Zone } from "../../shared/schema";

export const STATUS_LABELS: Record<Character["status"], string> = {
  suspect: "Suspect",
  witness: "Witness",
  ally: "Ally",
  victim: "Victim",
  cleared: "Cleared",
};

/** Ring colours: high contrast on aged paper, distinct after stream compression. */
export const STATUS_COLORS: Record<Character["status"], string> = {
  suspect: "#b3261e",
  witness: "#2b6cb0",
  ally: "#2f855a",
  victim: "#1f1f1f",
  cleared: "#b08d2b",
};

export const CAMEO_TOPS: Cameo["top"][] = ["bare", "tophat", "bowler", "bonnet", "helmet", "bun"];
export const CAMEO_FACES: Cameo["face"][] = ["none", "moustache", "beard"];
export const CAMEO_TOP_LABELS: Record<Cameo["top"], string> = {
  bare: "Bare head",
  tophat: "Top hat",
  bowler: "Bowler",
  bonnet: "Bonnet",
  helmet: "Police helmet",
  bun: "Hair bun",
};
export const CAMEO_FACE_LABELS: Record<Cameo["face"], string> = { none: "Clean-shaven", moustache: "Moustache", beard: "Beard" };

/** Visible characters in order of first appearance on the trail; unmet ones last. */
export function castOrder(characters: Character[], trail: TrailStep[]): Character[] {
  const first = new Map<string, number>();
  trail.forEach((step, i) => step.characterIds.forEach((id) => first.has(id) || first.set(id, i)));
  return characters
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !c.hidden)
    .sort((a, b) => (first.get(a.c.id) ?? Infinity) - (first.get(b.c.id) ?? Infinity) || a.i - b.i)
    .map(({ c }) => c);
}

/** Visible characters met at each zone of a map, in the order they were linked. */
export function facesByZone(trail: TrailStep[], mapId: string, characters: Character[]): Record<string, Character[]> {
  const byId = new Map(characters.filter((c) => !c.hidden).map((c) => [c.id, c]));
  const faces: Record<string, Character[]> = {};
  for (const step of trail) {
    if (step.mapId !== mapId || !step.zoneId) continue;
    for (const id of step.characterIds) {
      const c = byId.get(id);
      const list = (faces[step.zoneId] ??= []);
      if (c && !list.includes(c)) list.push(c);
    }
  }
  return Object.fromEntries(Object.entries(faces).filter(([, list]) => list.length));
}

/**
 * Re-reading a lead you hold a new letter for is free, so a return visit
 * defaults to "reread" when a letter was unlocked since the last visit there.
 */
export function suggestKind(trail: TrailStep[], keys: LetterKey[], mapId: string, zoneId: string): TrailStep["kind"] {
  const lastVisit = trail.findLastIndex((t) => t.mapId === mapId && t.zoneId === zoneId);
  if (lastVisit < 0) return "lead";
  const unlockedSince = keys.some((k) => {
    if (!k.unlocked || !k.unlockedAtStep) return false;
    return trail.findIndex((t) => t.id === k.unlockedAtStep) > lastVisit;
  });
  return unlockedSince ? "reread" : "lead";
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface CharacterMatch {
  character: Character;
  mapId: string;
  zone: Zone;
}

/** Characters whose name matches and whose address is on one of the case's maps. */
export function searchCharacters(
  query: string,
  characters: Character[],
  maps: Record<string, MapDef>,
  caseMapIds: string[],
): CharacterMatch[] {
  const q = squash(query);
  if (q.length < 2) return [];
  const out: CharacterMatch[] = [];
  for (const character of characters) {
    const a = character.address;
    if (!a || !caseMapIds.includes(a.mapId) || !squash(character.name).includes(q)) continue;
    const zone = maps[a.mapId]?.zones.find((z) => z.id === a.zoneId);
    if (zone) out.push({ character, mapId: a.mapId, zone });
  }
  return out;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A stable cameo for characters that never picked one. */
export function defaultCameo(id: string): Cameo {
  const h = hash(id);
  return { head: h % 4, top: CAMEO_TOPS[(h >>> 2) % CAMEO_TOPS.length], face: CAMEO_FACES[(h >>> 5) % CAMEO_FACES.length] };
}

export function randomCameo(): Cameo {
  const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
  return { head: pick([0, 1, 2, 3]), top: pick(CAMEO_TOPS), face: pick(CAMEO_FACES) };
}

export function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

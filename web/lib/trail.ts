// Pure helpers for drawing and searching the trail, shared by panel and overlay.

import type { Point } from "../../shared/geometry";
import type { MapDef, TrailStep, Zone } from "../../shared/schema";

/** Kinds that get a number on their pin; re-reads and dead ends show hollow. */
export const isNumbered = (kind: TrailStep["kind"]) => kind === "lead" || kind === "free";

export const KIND_LABELS: Record<TrailStep["kind"], string> = {
  lead: "Lead",
  free: "Free lead",
  reread: "Re-read",
  deadEnd: "Dead end",
};

export function leadCount(trail: TrailStep[]): number {
  return trail.filter((t) => t.kind === "lead").length;
}

export interface PinGroup {
  zoneId: string;
  /** Step numbers (trail positions) of numbered visits: "3 · 7". */
  label: string;
  hollow: boolean;
  /** Trail index of the latest visit, for "current position". */
  lastIndex: number;
}

/** One pin per visited zone; revisits stack their numbers. Ordered by first visit. */
export function pinGroups(trail: TrailStep[], mapId: string): PinGroup[] {
  const groups = new Map<string, { numbers: number[]; lastIndex: number }>();
  trail.forEach((step, i) => {
    if (step.mapId !== mapId || !step.zoneId) return;
    const g = groups.get(step.zoneId) ?? { numbers: [], lastIndex: i };
    if (isNumbered(step.kind)) g.numbers.push(i + 1);
    g.lastIndex = i;
    groups.set(step.zoneId, g);
  });
  return [...groups].map(([zoneId, g]) => ({
    zoneId,
    label: g.numbers.join(" · "),
    hollow: g.numbers.length === 0,
    lastIndex: g.lastIndex,
  }));
}

export interface Segment {
  key: string;
  from: string;
  to: string;
  toIndex: number;
}

/**
 * Path between consecutive visits on this map. Off-map leads are skipped
 * (the walk continues), a step on another map breaks the path, and staying
 * in the same zone draws nothing.
 */
export function pathSegments(trail: TrailStep[], mapId: string): Segment[] {
  const segments: Segment[] = [];
  let prev: { step: TrailStep } | null = null;
  trail.forEach((step, i) => {
    if (!step.zoneId) return;
    if (step.mapId !== mapId) {
      prev = null;
      return;
    }
    if (prev && prev.step.zoneId !== step.zoneId) {
      segments.push({ key: `${prev.step.id}>${step.id}`, from: prev.step.zoneId!, to: step.zoneId, toIndex: i });
    }
    prev = { step };
  });
  return segments;
}

/** Anchors of the last `n` visits on this map, for auto-framing. */
export function frameAnchors(trail: TrailStep[], mapId: string, anchors: Record<string, Point>, n: number): Point[] {
  return trail
    .filter((t) => t.mapId === mapId && t.zoneId && anchors[t.zoneId])
    .slice(-n)
    .map((t) => anchors[t.zoneId!]);
}

/** A gentle curve from a to b, bowing to the left of the direction of travel. */
export function curvePath([x0, y0]: Point, [x1, y1]: Point): string {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const bow = 0.18;
  const cx = mx + (y1 - y0) * bow;
  const cy = my - (x1 - x0) * bow;
  return `M${x0},${y0} Q${cx},${cy} ${x1},${y1}`;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface ZoneMatch {
  mapId: string;
  mapName: string;
  zone: Zone;
}

/** "14wc", "14 WC" and "14-wc" all find 14 WC; exact, then prefix, then contains. */
export function searchZones(query: string, maps: MapDef[], limit = 8): ZoneMatch[] {
  const q = squash(query);
  if (!q) return [];
  const scored: { m: ZoneMatch; score: number }[] = [];
  for (const map of maps) {
    for (const zone of map.zones) {
      const label = squash(zone.label);
      const words = zone.label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const score =
        label === q ? 0 : label.startsWith(q) ? 1 : words.some((w) => w.startsWith(q)) ? 2 : label.includes(q) ? 3 : -1;
      if (score >= 0) scored.push({ m: { mapId: map.id, mapName: map.name || map.id, zone }, score });
    }
  }
  return scored
    .sort((a, b) => a.score - b.score || a.m.zone.label.localeCompare(b.m.zone.label, undefined, { numeric: true }))
    .slice(0, limit)
    .map((s) => s.m);
}

export interface PlaceMatch extends ZoneMatch {
  /** The informant at this address, if any ("13 SW · Scotland Yard"). */
  informant?: string;
}

/**
 * Places by zone label or by informant name (`#scotland` → 13 SW · Scotland
 * Yard), best match first, each place once.
 */
export function searchPlaces(query: string, maps: MapDef[], limit = 8): PlaceMatch[] {
  const q = squash(query);
  if (!q) return [];
  const best = new Map<string, { m: PlaceMatch; score: number }>();
  const offer = (m: PlaceMatch, score: number) => {
    const key = `${m.mapId}/${m.zone.id}`;
    const prev = best.get(key);
    if (!prev || score < prev.score) best.set(key, { m, score });
  };
  const rank = (text: string) => {
    const s = squash(text);
    const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return s === q ? 0 : s.startsWith(q) ? 1 : words.some((w) => w.startsWith(q)) ? 2 : s.includes(q) ? 3 : -1;
  };
  for (const map of maps) {
    const informantAt = new Map((map.informants ?? []).map((i) => [i.zoneId, i.name]));
    for (const zone of map.zones) {
      const m: PlaceMatch = { mapId: map.id, mapName: map.name || map.id, zone, informant: informantAt.get(zone.id) };
      const byLabel = rank(zone.label);
      const byName = m.informant ? rank(m.informant) : -1;
      const score = Math.min(...[byLabel, byName].filter((s) => s >= 0));
      if (Number.isFinite(score)) offer(m, score);
    }
  }
  return [...best.values()]
    .sort((a, b) => a.score - b.score || a.m.zone.label.localeCompare(b.m.zone.label, undefined, { numeric: true }))
    .slice(0, limit)
    .map((s) => s.m);
}

/** Display name for a step's place. */
export function stepPlace(step: TrailStep, maps: Record<string, MapDef>): string {
  if (!step.mapId || !step.zoneId) return step.customLabel ?? "?";
  return maps[step.mapId]?.zones.find((z) => z.id === step.zoneId)?.label ?? step.zoneId;
}

export function newStepId(): string {
  // Math.random rather than crypto.randomUUID: the panel may run over plain http on the LAN.
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// Evidence cards: clue notes shown as typed paper slips.

import type { MapDef, Note, TrailStep } from "../../shared/schema";
import { stepPlace, zoneName } from "./trail";

/** Where the clue came from: "from 13 SW, step 4" (earliest linked step), else "re 13 SW". */
export function cardSource(note: Note, trail: TrailStep[], maps: Record<string, MapDef>): string | null {
  const index = Math.min(...note.stepIds.map((id) => trail.findIndex((t) => t.id === id)).filter((i) => i >= 0));
  if (Number.isFinite(index)) return `from ${stepPlace(trail[index], maps)}, step ${index + 1}`;
  const place = note.places[0];
  const zone = place && maps[place.mapId]?.zones.find((z) => z.id === place.zoneId);
  const label = zone && zoneName(zone);
  return label ? `re ${label}` : null;
}

/** A small, stable tilt in degrees, so a wall of cards looks pinned up by hand. */
export function cardTilt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 41) - 20) / 8; // −2.5° … +2.5°
}

// Game rules that several views compute the same way: scoring, the lead
// investigator's turn and timesheet mode.

import type { CaseState, MapDef, TrailStep } from "./schema";

/** Leads that count toward the total: kind "lead", minus those the solution declares free. */
export function countedLeads(trail: TrailStep[], freeStepIds: string[]): number {
  return trail.filter((t) => t.kind === "lead" && !freeStepIds.includes(t.id)).length;
}

/**
 * Question points, minus 5 per lead over Holmes's count (plus 5 per lead
 * under). The score stays null until Holmes's count is entered.
 */
export function scoreCase(scoring: CaseState["scoring"], trail: TrailStep[]): { points: number; leads: number; score: number | null } {
  const points = (scoring.series1 ?? 0) + (scoring.series2 ?? 0);
  const leads = countedLeads(trail, scoring.freeStepIds);
  const score = scoring.holmesLeads === null ? null : points - 5 * (leads - scoring.holmesLeads);
  return { points, leads, score };
}

/** The book passes left each turn: whose turn the next step is. */
export function currentInvestigator<P>(players: P[], trail: TrailStep[]): P | null {
  return players.length ? players[trail.length % players.length] : null;
}

// --- Timesheet (Queen's Park) ------------------------------------------------

export interface Clock {
  day: number;
  /** Minutes since midnight. */
  minutes: number;
}

const DAY_START = 9 * 60;
const DAY_END = 22 * 60;
const TRAVEL = 15;
const DEAD_END = 5;

function district(maps: Record<string, MapDef>, step: TrailStep): string | null {
  if (!step.mapId || !step.zoneId) return null;
  return maps[step.mapId]?.zones.find((z) => z.id === step.zoneId)?.district || null;
}

/** Areas apart on the map's adjacency table (undirected); null if unknown. */
function hops(map: MapDef | undefined, from: string, to: string): number | null {
  if (from === to) return 0;
  const adj = map?.adjacency ?? {};
  const neighbours = (d: string) => new Set([...(adj[d] ?? []), ...Object.keys(adj).filter((k) => adj[k].includes(d))]);
  const seen = new Set([from]);
  let frontier = [from];
  for (let n = 1; frontier.length; n++) {
    const next: string[] = [];
    for (const d of frontier) {
      for (const e of neighbours(d)) {
        if (e === to) return n;
        if (!seen.has(e)) seen.add(e), next.push(e);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * Time after each step. Moving costs 15 min within or to an adjacent area,
 * plus 15 for each area crossed; then the lead's stated duration. A dead end
 * costs 5 minutes. The day runs 9 a.m. to 10 p.m.; past that, it carries on
 * the next morning.
 */
export function timesheet(trail: TrailStep[], maps: Record<string, MapDef>): { steps: Clock[]; now: Clock } {
  let day = 1;
  let minutes = DAY_START;
  let prev: string | null = null;
  const steps: Clock[] = [];
  for (const step of trail) {
    let cost: number;
    const here = district(maps, step);
    if (step.kind === "deadEnd") cost = DEAD_END;
    else {
      const onMap = step.mapId !== null;
      const d = onMap && prev && here ? hops(maps[step.mapId!], prev, here) : null;
      const travel = onMap ? TRAVEL * Math.max(1, d ?? 1) : 0;
      cost = travel + (step.duration ?? 0);
    }
    if (here) prev = here;
    minutes += cost;
    while (minutes > DAY_END) {
      day += 1;
      minutes = DAY_START + (minutes - DAY_END);
    }
    steps.push({ day, minutes });
  }
  return { steps, now: steps.at(-1) ?? { day, minutes } };
}

export function formatClock({ day, minutes }: Clock): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `Day ${day} · ${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`;
}

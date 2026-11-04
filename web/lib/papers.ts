import type { Paper } from "../../shared/schema";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Papers the rules allow: the case's own plus every earlier-dated paper. In
 * timesheet mode, day N also unlocks the papers of the following N−1 days.
 */
export function shelfPapers(papers: Record<string, Paper>, ownId: string | null, day = 1): Paper[] {
  const own = ownId ? papers[ownId] : undefined;
  if (!own) return [];
  if (!own.date) return [own];
  const limit = addDays(own.date, Math.max(0, day - 1));
  return Object.values(papers)
    .filter((p) => p.id === own.id || (p.date !== null && p.date <= limit))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

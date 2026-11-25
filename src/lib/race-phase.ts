import { addDays, diffDays } from "./dates";
import { planWeeks, type Phase } from "./plan";
import type { RaceType } from "./types";

export const PHASE_INFO: Record<Phase, { label: string; blurb: string }> = {
  base: { label: "Base", blurb: "Easy volume and consistency. Build the habit and the aerobic engine." },
  build: { label: "Build", blurb: "Volume and quality sessions climb. This is where fitness is made." },
  peak: { label: "Peak", blurb: "Your hardest, most race-specific weeks. Protect sleep and food." },
  taper: { label: "Taper", blurb: "Volume drops, sharpness stays. Arrive fresh, not fit-less." },
};

export type PhaseInfo = { phase: Phase; label: string; blurb: string; week: number; totalWeeks: number; raceWeek: boolean; text: string };

/**
 * The plan's start: the earliest day of the newest batch of generated sessions. A rebuild re-plans from its own
 * start date, so only the latest batch tells which phase today's sessions belong to.
 */
export function planStartFrom(rows: { workout_date: string; created_at: string }[]): string | null {
  if (!rows.length) return null;
  const newest = Math.max(...rows.map((r) => Date.parse(r.created_at)));
  const batch = rows.filter((r) => newest - Date.parse(r.created_at) <= 15 * 60 * 1000);
  return batch.map((r) => r.workout_date).sort()[0] ?? null;
}

/** Phase for a given day of a race's plan, e.g. "Build phase, week 5 of 12". Null with no plan or after the race. */
export function phaseInfo(raceType: RaceType, raceDate: string, today: string, planStart: string | null): PhaseInfo | null {
  if (!planStart || diffDays(today, raceDate) < 0) return null;
  const weeks = planWeeks(raceType, planStart <= raceDate ? planStart : today, raceDate);
  const day = today < planStart ? planStart : today;
  let idx = weeks.findIndex((w) => w.weekStart <= day && day < addDays(w.weekStart, 7));
  if (idx < 0) idx = weeks.length - 1;
  const w = weeks[idx];
  const info = PHASE_INFO[w.phase];
  const text = w.isRaceWeek ? "Race week" : `${info.label} phase, week ${idx + 1} of ${weeks.length}`;
  return { phase: w.phase, label: info.label, blurb: w.isRaceWeek ? "Keep it light and boring. Everything is already done." : info.blurb, week: idx + 1, totalWeeks: weeks.length, raceWeek: w.isRaceWeek, text };
}

type Row = { race_id: string | null; workout_date: string; created_at: string };

/** Plan start per race from generated sessions. */
export function planStarts(rows: Row[]): Map<string, string> {
  const by = new Map<string, Row[]>();
  for (const r of rows) if (r.race_id) by.set(r.race_id, [...(by.get(r.race_id) ?? []), r]);
  const out = new Map<string, string>();
  for (const [id, rs] of by) {
    const s = planStartFrom(rs);
    if (s) out.set(id, s);
  }
  return out;
}

import type { Sport, Workout } from "./types";

export type SportTotals = { sport: Sport; plannedMin: number; doneMin: number };

/** The minutes a session counts for in every weekly total and list: what was done if it is done, otherwise what is planned. */
export const displayMinutes = (w: Pick<Workout, "status" | "planned_duration_min" | "actual_duration_min">): number | null =>
  w.status === "completed" ? (w.actual_duration_min ?? w.planned_duration_min) : (w.planned_duration_min ?? w.actual_duration_min);

/** Planned vs completed minutes by sport for a set of workouts (scope D-3). Skipped sessions count as planned but not done. */
export function weekSummary(workouts: Workout[]): { bySport: SportTotals[]; plannedMin: number; doneMin: number; compliance: number | null } {
  const map = new Map<Sport, SportTotals>();
  for (const w of workouts) {
    const t = map.get(w.sport) ?? { sport: w.sport, plannedMin: 0, doneMin: 0 };
    const planned = w.planned_duration_min ?? w.actual_duration_min ?? 0;
    t.plannedMin += planned;
    if (w.status === "completed") t.doneMin += w.actual_duration_min ?? planned;
    map.set(w.sport, t);
  }
  const bySport = [...map.values()].filter((t) => t.plannedMin > 0 || t.doneMin > 0).sort((a, b) => b.plannedMin - a.plannedMin);
  const plannedMin = bySport.reduce((a, t) => a + t.plannedMin, 0);
  const doneMin = bySport.reduce((a, t) => a + t.doneMin, 0);
  return { bySport, plannedMin, doneMin, compliance: plannedMin > 0 ? Math.round((doneMin / plannedMin) * 100) : null };
}

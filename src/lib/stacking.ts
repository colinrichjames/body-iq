import { addDays, formatDay } from "./dates";
import { classify } from "./intensity";
import type { Workout } from "./types";

export type StackWarning = { date: string; message: string };

/**
 * Flags heavy lower-body strength placed on the same day as, or the day before or after, a hard run.
 * Evidence: concurrent-training interference grows with proximity; separate hard sessions by 6-24 h.
 */
export function stackingWarnings(workouts: Workout[]): StackWarning[] {
  const active = workouts.filter((w) => w.status !== "skipped");
  const out: StackWarning[] = [];
  const seen = new Set<string>();

  for (const lift of active) {
    const l = classify(lift);
    if (!l.heavyLegs) continue;
    for (const other of active) {
      if (other.id === lift.id) continue;
      const o = classify(other);
      if (!o.hardRun) continue;
      const gap = Math.abs(new Date(`${other.workout_date}T00:00:00Z`).getTime() - new Date(`${lift.workout_date}T00:00:00Z`).getTime()) / 86_400_000;
      if (gap > 1) continue;
      const key = [lift.id, other.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const when =
        gap === 0
          ? `on ${formatDay(lift.workout_date)}`
          : `${formatDay(lift.workout_date)} and ${formatDay(other.workout_date)} back to back`;
      out.push({
        date: lift.workout_date < other.workout_date ? lift.workout_date : other.workout_date,
        message: `"${lift.title}" and "${other.title}" are stacked ${when}. Separate heavy legs and hard running by at least 6 hours, ideally a day.`,
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Next date within `within` days after `from` that has no hard session, or null. */
export function nextEasyDay(workouts: Workout[], from: string, within = 3): string | null {
  for (let i = 1; i <= within; i++) {
    const d = addDays(from, i);
    const hard = workouts.some((w) => w.workout_date === d && w.status !== "skipped" && classify(w).level === "hard");
    if (!hard) return d;
  }
  return null;
}

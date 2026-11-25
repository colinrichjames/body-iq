import { addDays, diffDays } from "./dates";
import { HARD_DAY_RPE, classify, plannedLoad, sessionLoad } from "./intensity";
import type { Workout } from "./types";

export type LoadSummary = {
  /** Fitness: 42-day exponentially weighted average of daily load. */
  ctl: number;
  /** Fatigue: 7-day exponentially weighted average of daily load. */
  atl: number;
  /** Form = fitness minus fatigue. Negative means carrying fatigue. */
  tsb: number;
  /** Estimate for the whole plan this week (assumed RPE by session type). Not changed by completing sessions. */
  weekPlannedLoad: number;
  /** What you actually logged this week: completed sessions, RPE x actual minutes. */
  weekActualLoad: number;
  /** Days with a completed session logged at RPE >= HARD_DAY_RPE. */
  weekHardDays: number;
  /** Planned sessions not yet done that are hard by type. */
  weekHardPlanned: number;
  /** Days of completed history behind the numbers. */
  historyDays: number;
  status: "building" | "steady" | "fatigued" | "fresh" | "insufficient";
};

/**
 * Simple fitness/fatigue trend from completed sessions (session-RPE x minutes).
 * This is an estimate, not a TrainingPeaks TSS clone.
 */
export function computeLoad(workouts: Workout[], today: string, weekStart: string, weekPlanned: Workout[]): LoadSummary {
  const done = workouts.filter((w) => w.status === "completed" && w.workout_date <= today);
  const daily = new Map<string, number>();
  for (const w of done) daily.set(w.workout_date, (daily.get(w.workout_date) ?? 0) + sessionLoad(w));

  const first = [...daily.keys()].sort()[0];
  let ctl = 0;
  let atl = 0;
  const historyDays = first ? diffDays(first, today) + 1 : 0;
  if (first) {
    for (let d = first; d <= today; d = addDays(d, 1)) {
      const load = daily.get(d) ?? 0;
      ctl += (load - ctl) / 42;
      atl += (load - atl) / 7;
    }
  }

  const inWeek = weekPlanned.filter((w) => w.status !== "skipped" && w.workout_date >= weekStart);
  const weekPlannedLoad = inWeek.reduce((a, w) => a + plannedLoad(w), 0);
  const weekActualLoad = inWeek.filter((w) => w.status === "completed").reduce((a, w) => a + sessionLoad(w), 0);
  const hardDates = new Set(inWeek.filter((w) => w.status === "completed" && (w.rpe ?? 0) >= HARD_DAY_RPE).map((w) => w.workout_date));
  const weekHardPlanned = inWeek.filter((w) => w.status !== "completed" && classify(w).level === "hard").length;

  const tsb = ctl - atl;
  let status: LoadSummary["status"] = "steady";
  if (historyDays < 14 || done.length < 4) status = "insufficient";
  else if (tsb < -15) status = "fatigued";
  else if (tsb > 10) status = "fresh";
  else if (atl > ctl * 1.1) status = "building";

  return { ctl: Math.round(ctl), atl: Math.round(atl), tsb: Math.round(tsb), weekPlannedLoad, weekActualLoad, weekHardDays: hardDates.size, weekHardPlanned, historyDays, status };
}

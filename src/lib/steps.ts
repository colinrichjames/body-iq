import { circuitOf } from "./circuit";
import type { Workout } from "./types";

export type Step = {
  exercise: string;
  setNumber: number;
  totalSets: number;
  reps?: number;
  seconds?: number;
  weight?: number;
  /** "m" when reps is a distance in metres. */
  unit?: "m";
  note?: string;
  restAfter: number;
  /** Rest after this set when the next set is the same exercise / a different one. Used when sets are reordered. */
  restSame?: number;
  restSwitch?: number;
};

/** Default rest between sets of the same exercise, and the floor for rest when moving to the next exercise. */
export const REST_BETWEEN_SETS = 75;
export const REST_BETWEEN_EXERCISES = 120;

/**
 * Every exercise as its own run of sets, so each can be done in any order. A circuit (rounds) becomes
 * straight sets (one per round), and a Hyrox "Round x3" station block becomes one exercise per station.
 */
export function buildSteps(w: Workout, totals?: Record<string, number> | null): Step[] {
  const s = w.structure;
  let ex = s?.exercises ?? [];
  const rounds = s?.rounds;
  if (rounds && ex.length) ex = ex.map((e) => ({ ...e, sets: rounds }));
  if (!ex.length) ex = circuitOf(s?.blocks)?.exercises ?? [];
  if (!ex.length) return [];
  if (totals) ex = ex.map((e) => (totals[e.name] ? { ...e, sets: totals[e.name] } : e));
  const steps: Step[] = [];
  const defaultRest = s?.rest_sec ?? REST_BETWEEN_SETS;
  const betweenExercises = Math.max(REST_BETWEEN_EXERCISES, defaultRest);
  ex.forEach((e, ei) => {
    const n = e.sets ?? 1;
    const restSame = e.rest_sec ?? defaultRest;
    const restSwitch = e.rest_sec ?? betweenExercises;
    for (let k = 1; k <= n; k++) {
      const isVeryLast = ei === ex.length - 1 && k === n;
      steps.push({
        exercise: e.name,
        setNumber: k,
        totalSets: n,
        reps: e.reps,
        seconds: e.seconds,
        weight: e.weight_lb,
        unit: e.unit,
        note: e.note,
        restAfter: isVeryLast ? 0 : k === n ? restSwitch : restSame,
        restSame,
        restSwitch,
      });
    }
  });
  return steps;
}

/** How many trackable units a session has: sets, blocks, or none (timer only). */
export function sessionUnits(w: Workout): { kind: "sets" | "blocks" | "timer"; total: number } {
  const sets = buildSteps(w).length;
  if (sets) return { kind: "sets", total: sets };
  const blocks = w.structure?.blocks?.length ?? 0;
  return blocks ? { kind: "blocks", total: blocks } : { kind: "timer", total: 0 };
}

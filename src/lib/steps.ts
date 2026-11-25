import type { Workout } from "./types";

export type Step = {
  exercise: string;
  setNumber: number;
  totalSets: number;
  reps?: number;
  seconds?: number;
  weight?: number;
  note?: string;
  restAfter: number;
};

/** Default rest between sets of the same exercise, and the floor for rest when moving to the next exercise. */
export const REST_BETWEEN_SETS = 75;
export const REST_BETWEEN_EXERCISES = 120;

export function buildSteps(w: Workout): Step[] {
  const s = w.structure;
  const ex = s?.exercises ?? [];
  if (!ex.length) return [];
  const steps: Step[] = [];
  const defaultRest = s?.rest_sec ?? REST_BETWEEN_SETS;
  const betweenExercises = Math.max(REST_BETWEEN_EXERCISES, defaultRest);
  if (s?.rounds) {
    for (let r = 1; r <= s.rounds; r++) {
      ex.forEach((e, i) => {
        const last = i === ex.length - 1;
        steps.push({
          exercise: e.name,
          setNumber: r,
          totalSets: s.rounds!,
          reps: e.reps,
          seconds: e.seconds,
          weight: e.weight_lb,
          note: e.note,
          restAfter: last ? (r === s.rounds ? 0 : (e.rest_sec ?? defaultRest)) : 0,
        });
      });
    }
  } else {
    ex.forEach((e, ei) => {
      const n = e.sets ?? 1;
      for (let k = 1; k <= n; k++) {
        const isVeryLast = ei === ex.length - 1 && k === n;
        steps.push({
          exercise: e.name,
          setNumber: k,
          totalSets: n,
          reps: e.reps,
          seconds: e.seconds,
          weight: e.weight_lb,
          note: e.note,
          restAfter: isVeryLast ? 0 : (e.rest_sec ?? (k === n ? betweenExercises : defaultRest)),
        });
      }
    });
  }
  return steps;
}

/** How many trackable units a session has: sets, blocks, or none (timer only). */
export function sessionUnits(w: Workout): { kind: "sets" | "blocks" | "timer"; total: number } {
  const sets = buildSteps(w).length;
  if (sets) return { kind: "sets", total: sets };
  const blocks = w.structure?.blocks?.length ?? 0;
  return blocks ? { kind: "blocks", total: blocks } : { kind: "timer", total: 0 };
}

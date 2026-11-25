import type { SetLog } from "./types";
import type { Step } from "./steps";

export const skippedLog = (step: Step): SetLog => ({ exercise: step.exercise, set_number: step.setNumber, reps: null, weight_lb: null, rpe: null, skipped: true });

/**
 * Skipping a whole exercise: the current set plus every following set of the same exercise.
 * Only for straight sets. In a circuit the sets of one exercise are spread across rounds, so it is not offered.
 */
export function skipExerciseLogs(steps: Step[], from: number): SetLog[] {
  const first = steps[from];
  if (!first) return [];
  const out: SetLog[] = [];
  for (let i = from; i < steps.length && steps[i].exercise === first.exercise; i++) out.push(skippedLog(steps[i]));
  return out;
}

export type ExerciseRecap = { exercise: string; done: number; skipped: number; lines: string[] };

/** Per-exercise recap for the finish screen and detail page. Skipped sets are listed as skipped, never dropped. */
export function recap(logs: SetLog[]): ExerciseRecap[] {
  const by = new Map<string, ExerciseRecap>();
  for (const l of logs) {
    const r = by.get(l.exercise) ?? { exercise: l.exercise, done: 0, skipped: 0, lines: [] };
    if (l.skipped) {
      r.skipped++;
      r.lines.push("skipped");
    } else {
      r.done++;
      r.lines.push(`${l.weight_lb !== null ? `${l.weight_lb} × ` : ""}${l.reps ?? "-"}${l.rpe ? ` @${l.rpe}` : ""}`);
    }
    by.set(l.exercise, r);
  }
  return [...by.values()];
}

export const countSets = (logs: SetLog[]) => ({ done: logs.filter((l) => !l.skipped).length, skipped: logs.filter((l) => l.skipped).length });

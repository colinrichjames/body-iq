import type { SetLog } from "./types";
import type { Step } from "./steps";

/** Identifies one set of one exercise, so a saved order survives a reload. */
export const stepKey = (s: { exercise: string; setNumber: number }) => `${s.exercise}#${s.setNumber}`;

/** Fixes rest after reordering: same-exercise sets use the set rest, a change of exercise uses the longer one, the last set none. */
function withRest(steps: Step[]): Step[] {
  return steps.map((s, i) => {
    const next = steps[i + 1];
    const restAfter = !next ? 0 : next.exercise === s.exercise ? (s.restSame ?? s.restAfter) : (s.restSwitch ?? s.restAfter);
    return { ...s, restAfter };
  });
}

/** Puts the steps in a saved order. Steps missing from it go last, unknown keys are ignored. */
export function applyOrder(steps: Step[], order: string[] | null | undefined): Step[] {
  if (!order?.length) return steps;
  const rank = new Map(order.map((k, i) => [k, i]));
  const sorted = steps
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (rank.get(stepKey(a.s)) ?? order.length + a.i) - (rank.get(stepKey(b.s)) ?? order.length + b.i))
    .map((x) => x.s);
  return withRest(sorted);
}

/** Moves the not-yet-done sets of one exercise to the front ("next") or the back ("later") of what is left. */
export function moveExercise(steps: Step[], from: number, exercise: string, where: "next" | "later"): Step[] {
  const done = steps.slice(0, from);
  const left = steps.slice(from);
  const moved = left.filter((s) => s.exercise === exercise);
  const rest = left.filter((s) => s.exercise !== exercise);
  if (!moved.length || !rest.length) return steps;
  return withRest([...done, ...(where === "next" ? [...moved, ...rest] : [...rest, ...moved])]);
}

export type QueueItem = { name: string; done: number; skipped: number; total: number; current: boolean; finished: boolean; unit?: "m" };

/** Exercises in the order they will be done (finished ones first), with how many sets of each are logged. */
export function queueOverview(steps: Step[], logs: SetLog[], stepIndex: number): QueueItem[] {
  const names: string[] = [];
  for (const s of steps) if (!names.includes(s.exercise)) names.push(s.exercise);
  const cur = steps[stepIndex]?.exercise;
  const items = names.map((name) => {
    const own = steps.filter((s) => s.exercise === name);
    const mine = logs.slice(0, stepIndex).filter((l) => l.exercise === name);
    const skipped = mine.filter((l) => l.skipped).length;
    return { name, done: mine.length - skipped, skipped, total: own.length, current: name === cur, finished: mine.length >= own.length, unit: own[0].unit };
  });
  // Finished exercises sink to the bottom so what is left stays on top.
  return [...items.filter((i) => !i.finished), ...items.filter((i) => i.finished)];
}

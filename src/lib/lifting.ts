import { isDumbbell } from "./context";
import type { Exercise, SetLog } from "./types";

/**
 * Sets a "Mark done" should record when the session was done as planned: one row per planned set, using the planned
 * reps (or seconds for holds) and weight, falling back to the last weight you used for that exercise.
 */
export function plannedSetLogs(exercises: Exercise[], rounds: number | undefined, lastWeights: Record<string, number> = {}): SetLog[] {
  const row = (e: Exercise, n: number): SetLog => ({
    exercise: e.name,
    set_number: n,
    reps: e.seconds ?? e.reps ?? null,
    weight_lb: e.weight_lb ?? lastWeights[e.name] ?? null,
    rpe: null,
    skipped: false,
  });
  const out: SetLog[] = [];
  if (rounds) {
    for (let r = 1; r <= rounds; r++) for (const e of exercises) out.push(row(e, r));
  } else {
    for (const e of exercises) for (let k = 1; k <= (e.sets ?? 1); k++) out.push(row(e, k));
  }
  return out;
}

/** Epley estimate of a one-rep max. Only meaningful up to about 12 reps; beyond that returns null. */
export function est1RM(weight: number, reps: number): number | null {
  if (!(weight > 0) || !(reps >= 1) || reps > 12) return null;
  return reps === 1 ? weight : Math.round(weight * (1 + reps / 30) * 10) / 10;
}

type Row = Pick<SetLog, "exercise" | "reps" | "weight_lb" | "skipped">;
export type PR = { exercise: string; kind: "weight" | "e1rm"; value: number; previous: number; weight: number; reps: number };

const done = (r: Row): r is Row & { reps: number; weight_lb: number } => !r.skipped && r.weight_lb !== null && r.reps !== null && Number(r.weight_lb) > 0 && Number(r.reps) >= 1;

/**
 * New personal records in `current` compared with everything before it (`prior`). An exercise with no earlier weighted
 * history has no baseline, so it is not called a PR. One PR per exercise: a heavier weight, else a better estimated 1RM.
 */
export function detectPRs(prior: Row[], current: Row[]): PR[] {
  const names = [...new Set(current.map((r) => r.exercise))];
  const out: PR[] = [];
  for (const exercise of names) {
    const before = prior.filter((r) => r.exercise === exercise).filter(done);
    const now = current.filter((r) => r.exercise === exercise).filter(done);
    if (!before.length || !now.length) continue;
    const prevMax = Math.max(...before.map((r) => Number(r.weight_lb)));
    const top = now.reduce((a, r) => (Number(r.weight_lb) > Number(a.weight_lb) || (Number(r.weight_lb) === Number(a.weight_lb) && Number(r.reps) > Number(a.reps)) ? r : a));
    if (Number(top.weight_lb) > prevMax) {
      out.push({ exercise, kind: "weight", value: Number(top.weight_lb), previous: prevMax, weight: Number(top.weight_lb), reps: Number(top.reps) });
      continue;
    }
    const e1 = (rows: (Row & { reps: number; weight_lb: number })[]) => Math.max(0, ...rows.map((r) => est1RM(Number(r.weight_lb), Number(r.reps)) ?? 0));
    const prevE = e1(before);
    const best = now.map((r) => ({ r, e: est1RM(Number(r.weight_lb), Number(r.reps)) ?? 0 })).sort((a, b) => b.e - a.e)[0];
    if (best && best.e > prevE && prevE > 0) out.push({ exercise, kind: "e1rm", value: best.e, previous: prevE, weight: Number(best.r.weight_lb), reps: Number(best.r.reps) });
  }
  return out;
}

export const prText = (p: PR) =>
  p.kind === "weight" ? `${p.exercise}: ${p.value} lb for ${p.reps} (was ${p.previous} lb)` : `${p.exercise}: ${p.weight} lb x ${p.reps}, est. 1RM ${p.value} lb (was ${p.previous})`;

export type NextWeight = { exercise: string; from: number; to: number; action: "up" | "same" | "down"; reason: string };

const LOWER = /squat|deadlift|leg press|hip thrust|lunge|rdl|romanian/i;
const round = (n: number, step: number) => Math.round(n / step) * step;

/**
 * What to load next time for each weighted exercise, from this session only. Hit the target reps on every set at the
 * top weight without grinding (RPE 8.5 or less): go up. Missed by a lot: go down. Otherwise repeat.
 * (A fuller progression engine across sessions comes later; this is the simple rule.)
 */
export function nextWeights(logs: SetLog[], targets: Record<string, number | undefined>): NextWeight[] {
  const names = [...new Set(logs.map((l) => l.exercise))];
  const out: NextWeight[] = [];
  for (const exercise of names) {
    const sets = logs.filter((l) => l.exercise === exercise).filter(done);
    const target = targets[exercise];
    if (!sets.length || !target) continue;
    const top = Math.max(...sets.map((s) => Number(s.weight_lb)));
    const atTop = sets.filter((s) => Number(s.weight_lb) === top);
    const rpes = atTop.map((s) => s.rpe).filter((r): r is number => typeof r === "number");
    const hit = atTop.every((s) => Number(s.reps) >= target);
    const avgMiss = atTop.reduce((a, s) => a + Math.max(0, target - Number(s.reps)), 0) / atTop.length;
    const grinding = rpes.length > 0 && Math.max(...rpes) > 8.5;
    const dumb = isDumbbell(exercise);
    const step = dumb ? (top < 30 ? 2.5 : 5) : LOWER.test(exercise) ? 10 : 5;
    if (hit && !grinding) out.push({ exercise, from: top, to: top + step, action: "up", reason: `Hit ${target} reps on every set${rpes.length ? ` at RPE ${Math.max(...rpes)} or easier` : ""}.` });
    else if (hit) out.push({ exercise, from: top, to: top, action: "same", reason: "Hit the reps but it was a grind. Own this weight first." });
    else if (avgMiss >= 2) out.push({ exercise, from: top, to: Math.max(0, round(top * 0.925, dumb ? 2.5 : 5)), action: "down", reason: `Missed ${target} reps by ${Math.round(avgMiss)} or more on average. Drop a little and rebuild.` });
    else out.push({ exercise, from: top, to: top, action: "same", reason: `Close to ${target} reps. Repeat this weight.` });
  }
  return out;
}

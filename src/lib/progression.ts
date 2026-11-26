import { isDumbbell } from "./context";
import { est1RM } from "./lifting";

export type HistSet = { weight: number; reps: number; rpe: number | null };
/** One finished session of one exercise: its working sets (skipped and unweighted sets removed). */
export type HistSession = { date: string; sets: HistSet[]; /** Prescribed sets that were skipped that day. */ skipped?: number };

export type Suggestion = {
  exercise: string;
  /** Weight for the first working set next time. */
  weight: number;
  /** The weight used last time, to show the change. */
  from: number;
  reps: number;
  action: "up" | "hold" | "down" | "deload";
  reason: string;
};

const LOWER = /squat|deadlift|leg press|hip thrust|lunge|rdl|romanian/i;

/** Smallest sensible jump for this lift: 2.5 lb light dumbbells, 5 lb other upper body, 10 lb lower body. */
export function loadStep(exercise: string, weight: number): number {
  if (isDumbbell(exercise)) return weight < 30 ? 2.5 : 5;
  return LOWER.test(exercise) ? 10 : 5;
}
const toStep = (w: number, step: number) => Math.max(0, Math.round(w / step) * step);

/** Reps you probably had left, from RPE (10 = none). Unknown RPE counts as 8, i.e. two left. */
const rir = (rpe: number | null) => Math.max(0, Math.min(5, 10 - (rpe ?? 8)));

/** Estimated 1RM for a set, counting reps in reserve. Effective reps are capped at 12, where the formula stops being reliable. */
export function setE1RM(s: HistSet): number | null {
  const raw = rawE1RM(s);
  return raw === null ? null : Math.round(raw * 10) / 10;
}
function rawE1RM(s: HistSet): number | null {
  const eff = Math.min(12, s.reps + rir(s.rpe));
  if (!(s.weight > 0) || eff < 1) return null;
  return s.weight * (1 + eff / 30);
}

/** The weight used for most sets of a session (the heavier one on a tie), and the sets done at it. */
export function working(sets: HistSet[]): { weight: number; sets: HistSet[] } | null {
  if (!sets.length) return null;
  const counts = new Map<number, number>();
  for (const s of sets) counts.set(s.weight, (counts.get(s.weight) ?? 0) + 1);
  const weight = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  return { weight, sets: sets.filter((s) => s.weight === weight) };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * What to lift next, from the last session (reps and RPE) with a look back at earlier ones.
 * With RPE logged: your estimated max (counting reps in reserve) says what weight gives `targetReps` at RPE 8, and the
 * change is capped at two steps either way. With no RPE: hit the target on every set and go up a step; miss by a lot and drop.
 * Grinding (RPE 9.5+) never goes up. `sessions` is newest first.
 */
export function suggestNext(exercise: string, sessions: HistSession[], targetReps: number, opts: { deload?: boolean } = {}): Suggestion | null {
  const last = sessions.find((s) => s.sets.length);
  const w = last ? working(last.sets) : null;
  if (!last || !w || !(targetReps >= 1)) return null;
  const W = w.weight;
  const step = loadStep(exercise, W);
  const rpes = w.sets.map((s) => s.rpe).filter((r): r is number => r !== null);
  const make = (weight: number, action: Suggestion["action"], reason: string): Suggestion => ({ exercise, weight, from: W, reps: targetReps, action, reason });

  if (opts.deload) return make(toStep(W * 0.9, step) || W, "deload", "Deload week: about 10% lighter than usual, same reps, nothing to failure.");

  const hit = w.sets.every((s) => s.reps >= targetReps);
  const skipped = last.skipped ?? 0;
  if (skipped > 0) return make(W, "hold", `${last.sets.length} of ${last.sets.length + skipped} sets completed last time. Repeat ${W} lb and finish every set before going up.`);
  const avgMiss = mean(w.sets.map((s) => Math.max(0, targetReps - s.reps)));
  const grinding = rpes.length > 0 && Math.max(...rpes) >= 9.5;
  const detail = `${w.sets.map((s) => s.reps).join(", ")} reps${rpes.length ? ` at RPE ${Math.max(...rpes)}` : ""}`;

  if (rpes.length > 0) {
    const e1 = mean(w.sets.map(rawE1RM).filter((x): x is number => x !== null));
    if (Number.isFinite(e1)) {
      const wanted = e1 / (1 + (targetReps + 2) / 30);
      const delta = Math.max(-2 * step, Math.min(2 * step, wanted - W));
      // Within half a step either way is noise: keep the weight.
      const next = Math.abs(delta) <= step / 2 + 1e-6 ? W : toStep(W + delta, step);
      if (next > W && !grinding) return make(next, "up", `${detail} last time: you had room for ${targetReps} reps at RPE 8 with more weight.`);
      if (next < W && (avgMiss >= 1 || grinding)) return make(next, "down", `${detail} last time was too heavy for ${targetReps} reps. Drop a little and rebuild.`);
      return make(W, "hold", grinding && hit ? `${detail}: hit the reps but it was a grind. Own this weight first.` : `${detail}: right where it should be. Repeat the weight and beat the reps.`);
    }
  }
  if (hit && !grinding) return make(W + step, "up", `Hit ${targetReps} reps on every set (${detail}).`);
  if (avgMiss >= 2) return make(toStep(W * 0.925, step) || W, "down", `Missed ${targetReps} reps by about ${Math.round(avgMiss)} (${detail}). Drop a little and rebuild.`);
  return make(W, "hold", hit ? `Hit the reps but it was a grind (${detail}). Own this weight first.` : `Close to ${targetReps} reps (${detail}). Repeat this weight.`);
}

export type DeloadCheck = { level: "none" | "watch" | "deload"; reasons: string[]; exercises: string[] };

/** Best estimated max of a session. */
const sessionBest = (s: HistSession) => Math.max(0, ...s.sets.map((x) => setE1RM(x) ?? est1RM(x.weight, x.reps) ?? 0));

/**
 * Do you need an easier week? Looks across lifts at the last few sessions of each:
 * - strength slipping: the last two sessions both 5% or more under the best of the sessions before them
 * - grinding: average RPE 9 or higher on the last two sessions
 * Two lifts flagged means deload; one lift or several poor-recovery days means watch; one lift plus poor recovery
 * means deload. `lowReadinessDays` is how many of the last 7 days scored amber or red.
 * `byExercise` has sessions newest first.
 */
export function deloadCheck(byExercise: Record<string, HistSession[]>, lowReadinessDays = 0): DeloadCheck {
  const slipping: string[] = [];
  const grinding: string[] = [];
  for (const [name, sessions] of Object.entries(byExercise)) {
    const s = sessions.filter((x) => x.sets.length);
    if (s.length < 3) continue;
    const [a, b, ...before] = s;
    const best = Math.max(...before.slice(0, 4).map(sessionBest));
    if (best > 0 && sessionBest(a) <= best * 0.95 && sessionBest(b) <= best * 0.95) slipping.push(name);
    const avgRpe = (x: HistSession) => {
      const r = x.sets.map((t) => t.rpe).filter((v): v is number => v !== null);
      return r.length ? mean(r) : null;
    };
    const ra = avgRpe(a);
    const rb = avgRpe(b);
    if (ra !== null && rb !== null && ra >= 9 && rb >= 9) grinding.push(name);
  }
  const flagged = [...new Set([...slipping, ...grinding])];
  const reasons: string[] = [];
  if (slipping.length) reasons.push(`Strength is slipping on ${slipping.slice(0, 3).join(", ")}${slipping.length > 3 ? ` and ${slipping.length - 3} more` : ""}: the last two sessions were 5% or more below your recent best.`);
  if (grinding.length) reasons.push(`Sets are feeling maximal (average RPE 9 or higher two sessions running) on ${grinding.slice(0, 3).join(", ")}${grinding.length > 3 ? ` and ${grinding.length - 3} more` : ""}.`);
  if (lowReadinessDays >= 4) reasons.push(`${lowReadinessDays} of the last 7 days had poor recovery.`);
  const level: DeloadCheck["level"] = flagged.length >= 2 || (flagged.length >= 1 && lowReadinessDays >= 4) ? "deload" : flagged.length >= 1 || lowReadinessDays >= 4 ? "watch" : "none";
  return { level, reasons, exercises: flagged };
}

export const DELOAD_PLAN = "Deload week: use about 90% of your usual weights, the same reps, one or two fewer sets, and stop every set with reps left. Then resume the build.";

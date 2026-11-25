import { classify } from "./intensity";
import type { LoadSummary } from "./load";
import type { Readiness } from "./readiness";
import type { Workout } from "./types";

export type Adaptation = {
  mode: "as_planned" | "trim" | "lighter" | "easy";
  /** Multiplier on suggested weights (1 = unchanged). */
  factor: number;
  /** Sets to drop from each exercise (0 or 1, never below 2 sets). */
  setsDelta: number;
  /** Fatigue points behind the call, for explaining it. */
  points: number;
  reasons: string[];
  headline: string;
};

const NONE: Adaptation = { mode: "as_planned", factor: 1, setsDelta: 0, points: 0, reasons: [], headline: "" };

/**
 * One call for today's session from readiness (sleep, HRV, soreness...), fitness/fatigue (TSB) and the deload check.
 * Points: readiness red 2 / amber 1, load fatigued 2 / building with form under -8 1, deload 2 / watch 1.
 * 0-1 as planned, 2 trim weights 5%, 3 lighter (-10%, one set fewer), 4+ easy (-15%, one set fewer).
 * Easy and mobility sessions are never adapted. When a deload is already in force the suggested weights are at
 * 90%, so only the set cut applies (`deloadActive`).
 */
export function adaptSession(
  w: Pick<Workout, "sport" | "title">,
  inputs: { readiness: Readiness | null; load: Pick<LoadSummary, "status" | "tsb"> | null; deload: "none" | "watch" | "deload" },
): Adaptation {
  if (classify(w).level === "easy") return NONE;
  const reasons: string[] = [];
  let points = 0;
  const { readiness, load, deload } = inputs;
  if (readiness && readiness.status !== "green") {
    points += readiness.status === "red" ? 2 : 1;
    reasons.push(readiness.status === "red" ? "Recovery is red today." : "Recovery is mixed today.");
  }
  if (load?.status === "fatigued") {
    points += 2;
    reasons.push("Fatigue is well above your fitness.");
  } else if (load?.status === "building" && load.tsb < -8) {
    points += 1;
    reasons.push("Training load has been climbing.");
  }
  if (deload === "deload") {
    points += 2;
    reasons.push("Your lifts say a deload is due.");
  } else if (deload === "watch") {
    points += 1;
    reasons.push("A lift is slipping or feeling hard.");
  }
  if (points <= 1) return { ...NONE, points, reasons };
  const deloadActive = deload === "deload";
  if (points === 2) return { mode: "trim", factor: deloadActive ? 1 : 0.95, setsDelta: 0, points, reasons, headline: "Trimmed a little for recovery" };
  if (points === 3) return { mode: "lighter", factor: deloadActive ? 1 : 0.9, setsDelta: 1, points, reasons, headline: "Lighter session today" };
  return { mode: "easy", factor: deloadActive ? 1 : 0.85, setsDelta: 1, points, reasons, headline: "Take it easy today" };
}

/** Scales a weight by the adaptation, rounded to the lift's step. */
export function adaptWeight(weight: number, factor: number, step: number): number {
  if (factor >= 1) return weight;
  return Math.max(step, Math.round((weight * factor) / step) * step);
}

/** Per-exercise set counts with `delta` sets removed (never below 2). Null when nothing changes. */
export function adaptedTotals(w: Pick<Workout, "structure">, delta: number): Record<string, number> | null {
  if (delta <= 0) return null;
  const s = w.structure;
  const out: Record<string, number> = {};
  for (const e of s?.exercises ?? []) {
    const n = s?.rounds ?? e.sets ?? 1;
    if (n > 2) out[e.name] = Math.max(2, n - delta);
  }
  return Object.keys(out).length ? out : null;
}

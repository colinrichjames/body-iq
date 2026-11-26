import { diffDays, addDays } from "./dates";

/** Share of calories from protein, carbs and fat (4, 4 and 9 per gram), as whole percents that add to 100. */
export function macroSplit(protein: number, carbs: number, fat: number): { p: number; c: number; f: number } | null {
  const kp = Math.max(0, protein) * 4;
  const kc = Math.max(0, carbs) * 4;
  const kf = Math.max(0, fat) * 9;
  const total = kp + kc + kf;
  if (total <= 0) return null;
  const raw = [kp, kc, kf].map((v) => (v / total) * 100);
  const floor = raw.map(Math.floor);
  let left = 100 - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - floor[i] })).sort((a, b) => b.frac - a.frac);
  for (const o of order) {
    if (left <= 0) break;
    floor[o.i]++;
    left--;
  }
  return { p: floor[0], c: floor[1], f: floor[2] };
}

export type Micro = { key: "sodium" | "fiber" | "sugar"; label: string; value: number; unit: string; goal: string; status: "ok" | "low" | "high" | "info" };

/**
 * Sodium, fibre and sugar against common guidelines: sodium up to 2,300 mg (athletes who sweat a lot can need more),
 * fibre about 14 g per 1,000 calories of your target (25 g if there's no target), total sugar shown without a limit
 * because it includes sugar in fruit and milk.
 */
export function micronutrients(t: { sodium_mg: number; fiber_g: number; sugar_g: number }, calorieTarget: number | null): Micro[] {
  const fiberGoal = Math.round(calorieTarget ? (calorieTarget / 1000) * 14 : 25);
  return [
    { key: "sodium", label: "Sodium", value: Math.round(t.sodium_mg), unit: " mg", goal: "under 2,300 mg", status: t.sodium_mg > 2300 ? "high" : "ok" },
    { key: "fiber", label: "Fibre", value: Math.round(t.fiber_g), unit: " g", goal: `about ${fiberGoal} g`, status: t.fiber_g >= fiberGoal ? "ok" : "low" },
    { key: "sugar", label: "Sugar", value: Math.round(t.sugar_g), unit: " g", goal: "total, no limit set", status: "info" },
  ];
}

/**
 * Logging streak from the days marked finished. It counts back from today if today is finished, otherwise from
 * yesterday (today is still open, so the streak is alive but not extended yet).
 */
export function loggingStreak(finished: string[], today: string): { current: number; longest: number; todayDone: boolean } {
  const set = new Set(finished.filter((d) => d <= today));
  const todayDone = set.has(today);
  let cur = 0;
  for (let d = todayDone ? today : addDays(today, -1); set.has(d); d = addDays(d, -1)) cur++;
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && diffDays(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current: cur, longest, todayDone };
}

export type RingSegment = { key: "carbs" | "fat" | "protein"; pct: number; /** stroke-dasharray "dash gap" for a circle of this circumference. */ dash: string; /** stroke-dashoffset that starts the arc where the last one ended. */ offset: number };

/**
 * Donut segments for the macro split, in the order carbs, fat, protein, starting at 12 o'clock when the circle is
 * rotated -90 degrees. Whole-percent arcs, so they always close the ring.
 */
export function ringSegments(split: { p: number; c: number; f: number } | null, circumference: number): RingSegment[] {
  if (!split) return [];
  let used = 0;
  return ([
    ["carbs", split.c],
    ["fat", split.f],
    ["protein", split.p],
  ] as const)
    .filter(([, pct]) => pct > 0)
    .map(([key, pct]) => {
      const len = (pct / 100) * circumference;
      const seg: RingSegment = { key, pct, dash: `${len} ${circumference - len}`, offset: -used };
      used += len;
      return seg;
    });
}

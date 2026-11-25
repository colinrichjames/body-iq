import { addDays, diffDays } from "./dates";
import type { DayTargets } from "./targets";

export type GoalMode = "lose" | "maintain" | "gain";
export const GOAL_LABEL: Record<GoalMode, string> = { lose: "Lose weight", maintain: "Maintain", gain: "Gain weight" };
export const DEFAULT_RATE: Record<GoalMode, number> = { lose: 1, maintain: 0, gain: 0.5 };
/** Calories in a pound of body weight change. A rule of thumb, which is why changes are small and re-checked weekly. */
export const KCAL_PER_LB = 3500;
export const CALORIE_FLOOR = 1500;
const MAX_STEP = 250;

export type WeightPoint = { day: string; weight: number };

/** Signed target rate in lb per week: negative to lose, positive to gain. */
export function wantedRate(mode: GoalMode, rate: number | null): number {
  const r = Math.abs(rate ?? DEFAULT_RATE[mode]);
  return mode === "lose" ? -r : mode === "gain" ? r : 0;
}

/** One weight per day (a weigh-in beats a scan on the same day), oldest first. */
export function mergeWeights(weighIns: WeightPoint[], scans: WeightPoint[]): WeightPoint[] {
  const byDay = new Map<string, number>();
  for (const s of scans) byDay.set(s.day, s.weight);
  for (const w of weighIns) byDay.set(w.day, w.weight);
  return [...byDay].map(([day, weight]) => ({ day, weight })).sort((a, b) => (a.day < b.day ? -1 : 1));
}

export type Trend = { trendWeight: number; ratePerWeek: number; points: number; spanDays: number };

/**
 * Trend weight and rate from the last `windowDays`: an exponentially smoothed weight (time-aware, about a 7-day
 * memory) and a least-squares slope. Needs 3 weights over at least 10 days, otherwise null.
 */
export function weightTrend(points: WeightPoint[], today: string, windowDays = 28): Trend | null {
  const pts = points.filter((p) => p.day <= today && p.day >= addDays(today, -windowDays)).sort((a, b) => (a.day < b.day ? -1 : 1));
  if (pts.length < 3) return null;
  const first = pts[0].day;
  const span = diffDays(first, pts[pts.length - 1].day);
  if (span < 10) return null;
  let ema = pts[0].weight;
  for (let i = 1; i < pts.length; i++) {
    const gap = diffDays(pts[i - 1].day, pts[i].day);
    const a = 1 - Math.exp(-gap / 7);
    ema += a * (pts[i].weight - ema);
  }
  const xs = pts.map((p) => diffDays(first, p.day));
  const ys = pts.map((p) => p.weight);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope = den ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den : 0;
  return { trendWeight: Math.round(ema * 10) / 10, ratePerWeek: Math.round(slope * 7 * 100) / 100, points: pts.length, spanDays: span };
}

export type CoachInput = {
  mode: GoalMode;
  /** Chosen rate in lb/week (magnitude); null uses the default for the mode. */
  rate: number | null;
  trend: Trend | null;
  /** Current training-day and rest-day calorie targets. */
  targets: DayTargets;
  restCalories: number | null;
  /** Days with food logged in the last 14 days. */
  loggedDays: number;
};

export type CoachAdvice = {
  status: "need_data" | "on_track" | "adjust";
  headline: string;
  detail: string;
  /** Calories per day to add (positive) or remove (negative), same change on training and rest days. */
  delta: number;
  newCalories: number | null;
  newRestCalories: number | null;
  /** Carbs absorb the change; protein and fat stay put. */
  carbsDelta: number;
};

const r25 = (n: number) => Math.round(n / 25) * 25;

/**
 * Compares the weight trend with the goal and suggests a small calorie change. A gap of 0.1 lb/week or less, or
 * under 100 kcal/day, counts as on track. Steps are capped at 250 kcal, rounded to 25, never below 1,500 kcal, and
 * only offered with 5+ logged days (otherwise you may simply be under-logging).
 */
export function coachAdvice(i: CoachInput): CoachAdvice {
  const none = { delta: 0, newCalories: null, newRestCalories: null, carbsDelta: 0 };
  if (!i.targets.calories) return { status: "need_data", headline: "Set a calorie target first", detail: "The coach adjusts your target, so it needs one to start from.", ...none };
  if (!i.trend) return { status: "need_data", headline: "Log your weight to start", detail: "Three weigh-ins over 10 days (or body scans) give a trend. Weigh at the same time each morning.", ...none };
  if (i.loggedDays < 5) return { status: "need_data", headline: "Log your food more days", detail: `Only ${i.loggedDays} of the last 14 days have food logged. With gaps the coach can't tell if the weight change is real, so it won't change targets yet.`, ...none };
  const want = wantedRate(i.mode, i.rate);
  const gap = want - i.trend.ratePerWeek; // lb/week still to find; negative means losing too slowly or gaining too fast
  const raw = (gap * KCAL_PER_LB) / 7;
  const rateText = `${i.trend.ratePerWeek > 0 ? "+" : ""}${i.trend.ratePerWeek} lb/week`;
  const goalText = want === 0 ? "holding steady" : `${want > 0 ? "+" : ""}${want} lb/week`;
  if (Math.abs(gap) <= 0.1 || Math.abs(raw) < 100) return { status: "on_track", headline: "On track", detail: `Trend is ${rateText} against a goal of ${goalText}. Keep your targets.`, ...none };
  let delta = Math.max(-MAX_STEP, Math.min(MAX_STEP, r25(raw)));
  if (delta < 0 && i.targets.calories + delta < CALORIE_FLOOR) delta = Math.min(0, CALORIE_FLOOR - i.targets.calories);
  if (delta === 0) return { status: "on_track", headline: "Holding at your calorie floor", detail: `Trend is ${rateText} against ${goalText}, but targets won't go under ${CALORIE_FLOOR.toLocaleString("en-US")} calories. Consider a slower goal rate.`, ...none };
  const newCalories = i.targets.calories + delta;
  const newRest = i.restCalories ? Math.max(CALORIE_FLOOR, i.restCalories + delta) : null;
  return {
    status: "adjust",
    headline: `${delta > 0 ? "Eat" : "Cut"} ${Math.abs(delta)} calories a day ${delta > 0 ? "more" : "less"}`,
    detail: `Trend is ${rateText} against a goal of ${goalText}. Suggest ${newCalories.toLocaleString("en-US")} calories on training days${newRest ? ` and ${newRest.toLocaleString("en-US")} on rest days` : ""}, taken from carbs.`,
    delta,
    newCalories,
    newRestCalories: newRest,
    carbsDelta: Math.round(delta / 4),
  };
}

/** The weekly check-in is due when it has never been done or the last one was 7 or more days ago. */
export const checkinDue = (last: string | null, today: string) => !last || diffDays(last, today) >= 7;

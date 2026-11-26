import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "./dates";
import { coachAdvice, mergeWeights, weightTrend, type CoachAdvice, type GoalMode, type Trend, type WeightPoint } from "./coach";
import { goalOf, GOALS, type GoalType } from "./goals";
import type { Profile } from "./types";

export type CoachState = {
  mode: GoalMode | null;
  goal: GoalType | null;
  rate: number | null;
  trend: Trend | null;
  advice: CoachAdvice;
  latest: WeightPoint | null;
  loggedDays: number;
  lastChecked: string | null;
  /** The most recent weights, newest first, for display. */
  recent: WeightPoint[];
};

/** Loads weigh-ins, scan weights and logged days, and works out the coach's call. Never throws. */
export async function loadCoach(supabase: SupabaseClient, today: string, profile: Profile | null): Promise<CoachState> {
  const since = addDays(today, -28);
  const [w, s, n] = await Promise.all([
    supabase.from("weigh_ins").select("day,weight_lb").gte("day", since).order("day"),
    supabase.from("body_scans").select("scanned_at,weight_lb").gte("scanned_at", since).not("weight_lb", "is", null),
    supabase.from("nutrition_days").select("day,calories").gte("day", addDays(today, -13)).gt("calories", 0),
  ]);
  const ins: WeightPoint[] = (w.data ?? []).map((r) => ({ day: r.day as string, weight: Number(r.weight_lb) }));
  const scans: WeightPoint[] = (s.data ?? []).map((r) => ({ day: String(r.scanned_at).slice(0, 10), weight: Number(r.weight_lb) }));
  const points = mergeWeights(ins, scans);
  const trend = weightTrend(points, today);
  const goal = goalOf(profile);
  const mode = goal ? GOALS[goal].mode : null;
  const loggedDays = (n.data ?? []).length;
  const advice = coachAdvice({
    mode: mode ?? "maintain",
    rate: profile?.goal_rate_lb_week ?? null,
    trend,
    targets: { calories: profile?.calorie_target ?? null, protein: profile?.protein_target_g ?? null, carbs: profile?.carbs_target_g ?? null, fat: profile?.fat_target_g ?? null },
    restCalories: profile?.rest_calorie_target ?? null,
    loggedDays,
  });
  return { mode, goal, rate: profile?.goal_rate_lb_week ?? null, trend, advice, latest: points.at(-1) ?? null, loggedDays, lastChecked: profile?.coach_checked_at ?? null, recent: [...points].reverse().slice(0, 5) };
}

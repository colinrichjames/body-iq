"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { getToday } from "@/lib/today";
import { isIsoDate } from "@/lib/dates";
import { CALORIE_FLOOR } from "@/lib/coach";
import { GOALS, isGoalType } from "@/lib/goals";

const BACK = new Set(["/nutrition", "/dashboard", "/profile"]);
const backOf = (formData: FormData) => {
  const from = String(formData.get("from") ?? "/nutrition");
  return BACK.has(from) ? from : "/nutrition";
};

/** Logs today's weight, or another day's. One per day; saving again replaces it. */
export async function logWeighIn(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const back = backOf(formData);
  const weight = Number(String(formData.get("weight_lb") ?? "").trim());
  if (!Number.isFinite(weight) || weight <= 50 || weight >= 700) redirect(flash(back, "Enter your weight in pounds, like 182.4."));
  const given = String(formData.get("day") ?? "");
  const today = await getToday();
  const day = isIsoDate(given) && given <= today ? given : today;
  const { error } = await supabase.from("weigh_ins").upsert({ user_id: userId, day, weight_lb: Math.round(weight * 10) / 10, updated_at: new Date().toISOString() }, { onConflict: "user_id,day" });
  if (error) redirect(flash(back, `Couldn't save your weight: ${error.message}`));
  revalidatePath("/", "layout");
  redirect(flash(back, "Weight saved."));
}

/** Saves the goal and the pace in lb per week. The goal sets the calorie direction and a default pace. */
export async function saveGoal(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const back = backOf(formData);
  const goal = formData.get("goal_type");
  if (!isGoalType(goal)) redirect(flash(back, "Pick a goal."));
  const g = GOALS[goal];
  const raw = String(formData.get("goal_rate") ?? "").trim();
  const rate = raw === "" ? g.rate : Number(raw);
  if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 2)) redirect(flash(back, "Pace must be between 0 and 2 lb a week."));
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, goal_type: goal, goal_mode: g.mode, goal_rate_lb_week: g.mode === "maintain" ? null : rate }, { onConflict: "id" });
  if (error) redirect(flash(back, `Couldn't save your goal: ${error.message}`));
  revalidatePath("/", "layout");
  redirect(flash(back, "Goal saved."));
}

/**
 * Applies the coach's suggestion: new calorie targets (training and rest) with carbs absorbing the change, and
 * marks this week's check-in done. The values come from the form, so they are re-validated here.
 */
export async function applyCoach(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const back = backOf(formData);
  const num = (k: string) => {
    const n = Number(formData.get(k));
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const calories = num("calories");
  const rest = num("rest_calories");
  const carbsDelta = num("carbs_delta") ?? 0;
  if (calories === null || calories < CALORIE_FLOOR || calories > 8000) redirect(flash(back, "That calorie target looks off, so nothing changed."));
  const { data: p } = await supabase.from("profiles").select("carbs_target_g,rest_carbs_g,rest_calorie_target").eq("id", userId).maybeSingle<{ carbs_target_g: number | null; rest_carbs_g: number | null; rest_calorie_target: number | null }>();
  const patch: Record<string, number | string | null> = { id: userId, calorie_target: calories, coach_checked_at: await getToday() };
  if (p?.carbs_target_g !== null && p?.carbs_target_g !== undefined) patch.carbs_target_g = Math.max(0, p.carbs_target_g + carbsDelta);
  if (rest !== null && rest >= CALORIE_FLOOR && p?.rest_calorie_target) {
    patch.rest_calorie_target = rest;
    if (p.rest_carbs_g !== null) patch.rest_carbs_g = Math.max(0, p.rest_carbs_g + carbsDelta);
  }
  const { error } = await supabase.from("profiles").upsert(patch, { onConflict: "id" });
  if (error) redirect(flash(back, `Couldn't update your targets: ${error.message}`));
  revalidatePath("/", "layout");
  redirect(flash(back, "Targets updated."));
}

/** Keeps today's targets and snoozes the weekly check-in for 7 days. */
export async function keepTargets(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const back = backOf(formData);
  const { error } = await supabase.from("profiles").upsert({ id: userId, coach_checked_at: await getToday() }, { onConflict: "id" });
  if (error) redirect(flash(back, `Couldn't save that: ${error.message}`));
  revalidatePath("/", "layout");
  redirect(flash(back, "Kept your targets. Next check-in in a week."));
}

"use server";

import { flash } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isIsoDate } from "@/lib/dates";
import { syncFoodDay } from "@/lib/food-sync";
import type { NutritionRow } from "@/lib/mfp";
import { dbError } from "@/lib/db-error";

function targetOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n < 20000 ? Math.round(n) : null;
}

export async function saveTargets(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .upsert({
      id: userId,
      calorie_target: targetOrNull(formData.get("calorie_target")),
      protein_target_g: targetOrNull(formData.get("protein_target_g")),
      carbs_target_g: targetOrNull(formData.get("carbs_target_g")),
      fat_target_g: targetOrNull(formData.get("fat_target_g")),
      rest_calorie_target: targetOrNull(formData.get("rest_calorie_target")),
      rest_protein_g: targetOrNull(formData.get("rest_protein_g")),
      rest_carbs_g: targetOrNull(formData.get("rest_carbs_g")),
      rest_fat_g: targetOrNull(formData.get("rest_fat_g")),
    }, { onConflict: "id" });
  if (error) redirect(`/nutrition?error=${encodeURIComponent("Couldn't save your targets. Try again.")}`);
  revalidatePath("/", "layout");
  redirect(flash("/nutrition", "Targets saved."));
}

/**
 * Import MyFitnessPal day totals into the one food log (as a "day total" entry per day, in Other). Days that already
 * have foods logged here are skipped so nothing is counted twice; re-importing replaces earlier imported totals.
 */
export async function importNutrition(rows: NutritionRow[]): Promise<{ error: string | null; count: number; skipped?: number }> {
  const { supabase, userId } = await requireUser();
  const clean = rows.filter((r) => isIsoDate(r.day)).slice(0, 800);
  if (clean.length === 0) return { error: "Nothing to import.", count: 0 };

  const days = [...new Set(clean.map((r) => r.day))];
  const { data: busy } = await supabase.from("food_entries").select("day").in("day", days).eq("source", "logged");
  const busyDays = new Set((busy ?? []).map((r) => r.day as string));
  const take = clean.filter((r) => !busyDays.has(r.day));
  const takeDays = [...new Set(take.map((r) => r.day))];
  if (takeDays.length === 0) return { error: null, count: 0, skipped: busyDays.size };

  await supabase.from("food_entries").delete().in("day", takeDays).eq("source", "myfitnesspal");
  const { error } = await supabase.from("food_entries").insert(
    take.map((r) => ({
      user_id: userId,
      day: r.day,
      meal: "other",
      name: "MyFitnessPal (day total)",
      amount_label: "whole day",
      calories: r.calories ?? 0,
      protein_g: r.protein_g ?? 0,
      carbs_g: r.carbs_g ?? 0,
      fat_g: r.fat_g ?? 0,
      sodium_mg: r.sodium_mg,
      sugar_g: r.sugar_g,
      fiber_g: r.fiber_g,
      source: "myfitnesspal",
    })),
  );
  if (error) return { error: dbError(error, true), count: 0 };
  for (const d of takeDays) await syncFoodDay(supabase, userId, d);

  revalidatePath("/", "layout");
  return { error: null, count: takeDays.length, skipped: busyDays.size };
}

function macro(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 20000 ? n : null;
}

/**
 * Quick add: a day total typed by hand. It goes into the food log as one "Quick add" entry (Other), replacing an earlier
 * quick add for that day. Foods you logged stay, and the day's totals are the sum of everything.
 */
export async function quickAdd(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const day = String(formData.get("day") ?? "");
  const calories = macro(formData.get("calories"));
  if (!isIsoDate(day) || calories === null || calories <= 0) {
    redirect(`/nutrition?error=${encodeURIComponent("Enter a date and calories.")}`);
  }
  await supabase.from("food_entries").delete().eq("day", day).eq("source", "manual");
  const { error } = await supabase.from("food_entries").insert({
    user_id: userId,
    day,
    meal: "other",
    name: "Quick add (day total)",
    amount_label: "whole day",
    calories,
    protein_g: macro(formData.get("protein_g")) ?? 0,
    carbs_g: macro(formData.get("carbs_g")) ?? 0,
    fat_g: macro(formData.get("fat_g")) ?? 0,
    source: "manual",
  });
  if (error) redirect(`/nutrition?error=${encodeURIComponent(dbError(error, true))}`);
  await syncFoodDay(supabase, userId, day);
  revalidatePath("/", "layout");
  redirect(flash(`/nutrition/log?d=${day}`, "Added to your food log."));
}

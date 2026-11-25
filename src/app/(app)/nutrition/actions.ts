"use server";

import { flash } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isIsoDate } from "@/lib/dates";
import type { NutritionRow } from "@/lib/mfp";

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

export async function importNutrition(rows: NutritionRow[]): Promise<{ error: string | null; count: number }> {
  const { supabase, userId } = await requireUser();
  const clean = rows
    .filter((r) => isIsoDate(r.day))
    .slice(0, 800)
    .map((r) => ({
      user_id: userId,
      day: r.day,
      calories: r.calories,
      protein_g: r.protein_g,
      carbs_g: r.carbs_g,
      fat_g: r.fat_g,
      sodium_mg: r.sodium_mg,
      sugar_g: r.sugar_g,
      fiber_g: r.fiber_g,
      source: "myfitnesspal",
    }));
  if (clean.length === 0) return { error: "Nothing to import.", count: 0 };

  const { error } = await supabase.from("nutrition_days").upsert(clean, { onConflict: "user_id,day" });
  if (error) return { error: error.message, count: 0 };

  revalidatePath("/", "layout");
  return { error: null, count: clean.length };
}

function macro(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 20000 ? n : null;
}

/** Quick-add: set a day's totals by hand (scope N-4). Overwrites that day. */
export async function quickAdd(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const day = String(formData.get("day") ?? "");
  const calories = macro(formData.get("calories"));
  if (!isIsoDate(day) || calories === null || calories <= 0) {
    redirect(`/nutrition?error=${encodeURIComponent("Enter a date and calories.")}`);
  }
  const { error } = await supabase.from("nutrition_days").upsert(
    {
      user_id: userId,
      day,
      calories,
      protein_g: macro(formData.get("protein_g")),
      carbs_g: macro(formData.get("carbs_g")),
      fat_g: macro(formData.get("fat_g")),
      source: "manual",
    },
    { onConflict: "user_id,day" },
  );
  if (error) redirect(`/nutrition?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  redirect(flash("/nutrition", "Day saved."));
}

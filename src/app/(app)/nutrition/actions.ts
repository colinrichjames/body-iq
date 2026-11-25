"use server";

import { revalidatePath } from "next/cache";
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
    .update({
      calorie_target: targetOrNull(formData.get("calorie_target")),
      protein_target_g: targetOrNull(formData.get("protein_target_g")),
      carbs_target_g: targetOrNull(formData.get("carbs_target_g")),
      fat_target_g: targetOrNull(formData.get("fat_target_g")),
    })
    .eq("id", userId);
  if (error) console.error("saveTargets", error.message);
  revalidatePath("/nutrition");
  revalidatePath("/dashboard");
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

  revalidatePath("/nutrition");
  revalidatePath("/dashboard");
  return { error: null, count: clean.length };
}

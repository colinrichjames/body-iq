"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isIsoDate } from "@/lib/dates";
import { syncFoodDay } from "@/lib/food-sync";
import { toTrash, withUndo } from "@/lib/trash";

const MEALS = ["breakfast", "lunch", "dinner", "snack"];

export type FoodEntryInput = {
  day: string;
  meal: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  amountLabel?: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sodium_mg?: number | null;
  sugar_g?: number | null;
  fiber_g?: number | null;
  /** Remember this food (with its barcode) for next time. */
  saveCustom?: { servingLabel: string; perServing: { calories: number; protein_g: number; carbs_g: number; fat_g: number } } | null;
};

const ok = (v: unknown, max = 20000) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < max;
const opt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 100000 ? v : null);

async function syncDay(day: string) {
  const { supabase, userId } = await requireUser();
  await syncFoodDay(supabase, userId, day);
}

function refresh(day: string) {
  revalidatePath("/", "layout");
  void day;
}

export async function addFoodEntry(input: FoodEntryInput): Promise<{ error: string | null }> {
  const { supabase, userId } = await requireUser();
  const name = (input.name ?? "").trim();
  if (!isIsoDate(input.day)) return { error: "Pick a date." };
  if (!MEALS.includes(input.meal)) return { error: "Pick a meal." };
  if (!name) return { error: "Give the food a name." };
  if (!ok(input.calories) || !ok(input.protein_g) || !ok(input.carbs_g) || !ok(input.fat_g)) return { error: "Check the numbers." };

  const { error } = await supabase.from("food_entries").insert({
    user_id: userId,
    day: input.day,
    meal: input.meal,
    name: name.slice(0, 160),
    brand: input.brand?.slice(0, 120) || null,
    barcode: input.barcode && /^\d{6,14}$/.test(input.barcode) ? input.barcode : null,
    amount_label: input.amountLabel?.slice(0, 60) || null,
    calories: input.calories,
    protein_g: input.protein_g,
    carbs_g: input.carbs_g,
    fat_g: input.fat_g,
    sodium_mg: opt(input.sodium_mg),
    sugar_g: opt(input.sugar_g),
    fiber_g: opt(input.fiber_g),
  });
  if (error) return { error: error.message };

  if (input.saveCustom && ok(input.saveCustom.perServing.calories)) {
    const p = input.saveCustom.perServing;
    const barcode = input.barcode && /^\d{6,14}$/.test(input.barcode) ? input.barcode : null;
    const row = {
      user_id: userId,
      barcode,
      name: name.slice(0, 160),
      brand: input.brand?.slice(0, 120) || null,
      serving_label: input.saveCustom.servingLabel.slice(0, 60) || "1 serving",
      calories: p.calories,
      protein_g: p.protein_g,
      carbs_g: p.carbs_g,
      fat_g: p.fat_g,
    };
    // Best effort: a duplicate barcode just keeps the first copy.
    if (barcode) await supabase.from("custom_foods").upsert(row, { onConflict: "user_id,barcode", ignoreDuplicates: true });
    else await supabase.from("custom_foods").insert(row);
  }

  await syncDay(input.day);
  refresh(input.day);
  return { error: null };
}

export async function deleteFoodEntry(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const day = String(formData.get("day") ?? "");
  const { data: entry } = await supabase.from("food_entries").select("*").eq("id", id).maybeSingle<{ name: string }>();
  const undo = entry ? await toTrash(supabase, userId, "food_entry", entry.name, { entry }) : null;
  await supabase.from("food_entries").delete().eq("id", id);
  const label = entry?.name ?? "Food";
  if (isIsoDate(day)) {
    await syncDay(day);
    refresh(day);
    redirect(withUndo(`/nutrition/log?d=${day}`, undo, label));
  }
  redirect(withUndo("/nutrition/log", undo, label));
}

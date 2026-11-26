import type { SupabaseClient } from "@supabase/supabase-js";
import type { NutritionDay } from "./types";

type Row = { day: string; calories: number | string | null; protein_g: number | string | null; carbs_g: number | string | null; fat_g: number | string | null; sodium_mg: number | string | null; sugar_g: number | string | null; fiber_g: number | string | null };

const COLS = "day,calories,protein_g,carbs_g,fat_g,sodium_mg,sugar_g,fiber_g";

/** Adds food rows up into one total per day, newest day first. Numbers arrive from PostgREST as strings sometimes. */
export function totalsByDay(rows: Row[]): NutritionDay[] {
  const out = new Map<string, NutritionDay>();
  const n = (v: number | string | null) => (v === null ? 0 : Number(v) || 0);
  for (const r of rows) {
    const d = out.get(r.day) ?? { user_id: "", day: r.day, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, sodium_mg: 0, sugar_g: 0, fiber_g: 0, source: "logged" };
    d.calories = (d.calories ?? 0) + n(r.calories);
    d.protein_g = (d.protein_g ?? 0) + n(r.protein_g);
    d.carbs_g = (d.carbs_g ?? 0) + n(r.carbs_g);
    d.fat_g = (d.fat_g ?? 0) + n(r.fat_g);
    d.sodium_mg = (d.sodium_mg ?? 0) + n(r.sodium_mg);
    d.sugar_g = (d.sugar_g ?? 0) + n(r.sugar_g);
    d.fiber_g = (d.fiber_g ?? 0) + n(r.fiber_g);
    out.set(r.day, d);
  }
  const round = (v: number | null) => Math.round((v ?? 0) * 10) / 10;
  return [...out.values()]
    .map((d) => ({ ...d, calories: round(d.calories), protein_g: round(d.protein_g), carbs_g: round(d.carbs_g), fat_g: round(d.fat_g), sodium_mg: round(d.sodium_mg), sugar_g: round(d.sugar_g), fiber_g: round(d.fiber_g) }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}

/**
 * Daily food totals from the food log itself, the one place food is recorded. Every page that shows calories or macros
 * for a day reads this (never the nutrition_days rollup, which can lag), so the numbers can't disagree.
 */
export async function loadNutritionDays(supabase: SupabaseClient, since: string): Promise<NutritionDay[]> {
  const { data } = await supabase.from("food_entries").select(COLS).gte("day", since).limit(5000);
  return totalsByDay((data ?? []) as Row[]);
}

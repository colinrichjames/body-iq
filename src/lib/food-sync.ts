import type { SupabaseClient } from "@supabase/supabase-js";

/** Rolls a day's food entries up into nutrition_days so targets, insights and the dashboard stay in step. */
export async function syncFoodDay(supabase: SupabaseClient, userId: string, day: string) {
  const { data } = await supabase.from("food_entries").select("calories,protein_g,carbs_g,fat_g,sodium_mg,sugar_g,fiber_g").eq("day", day);
  const rows = data ?? [];
  if (rows.length === 0) {
    await supabase.from("nutrition_days").delete().eq("day", day).eq("source", "logged");
    return;
  }
  const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g" | "sodium_mg" | "sugar_g" | "fiber_g") =>
    Math.round(rows.reduce((a, r) => a + Number(r[k] ?? 0), 0) * 10) / 10;
  await supabase.from("nutrition_days").upsert(
    {
      user_id: userId,
      day,
      calories: sum("calories"),
      protein_g: sum("protein_g"),
      carbs_g: sum("carbs_g"),
      fat_g: sum("fat_g"),
      sodium_mg: sum("sodium_mg"),
      sugar_g: sum("sugar_g"),
      fiber_g: sum("fiber_g"),
      source: "logged",
    },
    { onConflict: "user_id,day" },
  );
}

import { requireUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

const TABLES = ["profiles", "body_scans", "races", "workouts", "workout_sets", "nutrition_days", "food_entries", "custom_foods", "hyrox_benchmarks", "activities", "daily_health"] as const;
const CSV_TABLES: Record<string, string> = { workouts: "workouts", sets: "workout_sets", nutrition: "nutrition_days", food: "food_entries", activities: "activities", health: "daily_health", scans: "body_scans" };

const FOOD_COLUMNS = ["day", "meal", "name", "brand", "amount_label", "calories", "protein_g", "carbs_g", "fat_g", "sodium_mg", "sugar_g", "fiber_g", "barcode", "source", "created_at"];

const csvResponse = (body: string, type: string, stamp: string) =>
  new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="body-iq-${type}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });

/** Your data, all of it, any time: JSON for everything, CSV for the main logs. Garmin keys are never included. */
export async function GET(request: Request) {
  const { supabase } = await requireUser();
  const type = new URL(request.url).searchParams.get("type") ?? "json";
  const stamp = new Date().toISOString().slice(0, 10);

  if (type in CSV_TABLES) {
    // Food: every entry, oldest first, in the order you would read it. Includes day totals from quick add and imports.
    if (type === "food") {
      const { data, error } = await supabase.from("food_entries").select("*").order("day").order("created_at");
      if (error) return new Response(error.message, { status: 500 });
      return csvResponse(toCsv((data ?? []) as Record<string, unknown>[], FOOD_COLUMNS), type, stamp);
    }
    const { data, error } = await supabase.from(CSV_TABLES[type]).select("*");
    if (error) return new Response(error.message, { status: 500 });
    return csvResponse(toCsv((data ?? []) as Record<string, unknown>[]), type, stamp);
  }

  const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
  for (const t of TABLES) {
    const { data, error } = await supabase.from(t).select("*");
    out[t] = error ? { error: error.message } : data;
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="body-iq-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TABLES = ["profiles", "body_scans", "races", "workouts", "workout_sets", "nutrition_days", "food_entries", "custom_foods", "hyrox_benchmarks", "activities", "daily_health"] as const;
const CSV_TABLES: Record<string, string> = { workouts: "workouts", sets: "workout_sets", nutrition: "nutrition_days", food: "food_entries", activities: "activities", health: "daily_health", scans: "body_scans" };

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  // Raw Garmin payloads are huge and belong in the JSON export, not a spreadsheet.
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => c !== "raw_json");
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
}

/** Your data, all of it, any time: JSON for everything, CSV for the main logs. Garmin keys are never included. */
export async function GET(request: Request) {
  const { supabase } = await requireUser();
  const type = new URL(request.url).searchParams.get("type") ?? "json";
  const stamp = new Date().toISOString().slice(0, 10);

  if (type in CSV_TABLES) {
    const { data, error } = await supabase.from(CSV_TABLES[type]).select("*");
    if (error) return new Response(error.message, { status: 500 });
    return new Response(toCsv((data ?? []) as Record<string, unknown>[]), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="body-iq-${type}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
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

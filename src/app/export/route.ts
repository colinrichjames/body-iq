import { requireUser } from "@/lib/auth";
import { toCsv, withBom } from "@/lib/csv";
import { buildCalendar, isClock } from "@/lib/ics";
import { addDays } from "@/lib/dates";
import { getToday } from "@/lib/today";
import { raceLabel } from "@/lib/plan";
import type { RaceType } from "@/lib/types";

export const dynamic = "force-dynamic";

/** How each table is ordered, so a file reads oldest to newest and re-exports match. */
const TABLES: Record<string, string[]> = {
  profiles: [],
  body_scans: ["scanned_at", "created_at"],
  races: ["race_date"],
  workouts: ["workout_date", "created_at"],
  workout_sets: ["created_at"],
  nutrition_days: ["day"],
  food_entries: ["day", "created_at"],
  hydration_days: ["day"],
  custom_foods: ["created_at"],
  hyrox_benchmarks: ["effort_date", "created_at"],
  activities: ["started_at"],
  daily_health: ["day"],
  recovery_checkins: ["day"],
  weigh_ins: ["day"],
};
const CSV_TABLES: Record<string, string> = { workouts: "workouts", sets: "workout_sets", nutrition: "nutrition_days", food: "food_entries", hydration: "hydration_days", activities: "activities", health: "daily_health", checkins: "recovery_checkins", weighins: "weigh_ins", scans: "body_scans", races: "races", benchmarks: "hyrox_benchmarks" };

const FOOD_COLUMNS = ["day", "meal", "name", "brand", "amount_label", "calories", "protein_g", "carbs_g", "fat_g", "sodium_mg", "sugar_g", "fiber_g", "barcode", "source", "created_at"];

const csvResponse = (body: string, type: string, stamp: string) =>
  new Response(withBom(body), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="body-iq-${type}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });

type Client = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** Every row, not just the first 1,000 the database returns per request. */
async function fetchAll(supabase: Client, table: string, order: string[]): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select("*");
    for (const o of order) q = q.order(o);
    const { data, error } = await q.range(from, from + 999);
    if (error) return { rows, error: error.message };
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if ((data?.length ?? 0) < 1000) return { rows, error: null };
  }
}

/** Planned sessions and races as a calendar file, so your phone's calendar does the reminding. */
async function calendar(supabase: Client, time: string, stamp: string) {
  const today = await getToday();
  const [{ data: ws }, { data: races }] = await Promise.all([
    supabase.from("workouts").select("id,workout_date,title,description,planned_duration_min,sport").eq("status", "planned").gte("workout_date", today).lte("workout_date", addDays(today, 120)).order("workout_date"),
    supabase.from("races").select("id,name,race_type,race_date,location").gte("race_date", today).order("race_date"),
  ]);
  const events = [
    ...(ws ?? []).map((w) => ({ uid: `w-${w.id}`, date: w.workout_date as string, time, durationMin: (w.planned_duration_min as number | null) ?? 60, title: w.title as string, description: (w.description as string | null) ?? undefined, alarm: true })),
    ...(races ?? []).map((r) => ({ uid: `r-${r.id}`, date: r.race_date as string, title: `Race day: ${r.name}`, description: `${raceLabel(r.race_type as RaceType)}${r.location ? ` · ${r.location}` : ""}` })),
  ];
  return new Response(buildCalendar(events), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="body-iq-training-${stamp}.ics"`, "Cache-Control": "no-store" },
  });
}

/** Your data, all of it, any time: JSON for everything, CSV for the main logs. Garmin keys are never included. */
export async function GET(request: Request) {
  const { supabase } = await requireUser();
  const params = new URL(request.url).searchParams;
  const type = params.get("type") ?? "json";
  const stamp = new Date().toISOString().slice(0, 10);

  if (type === "calendar") {
    const time = params.get("time") ?? "07:00";
    if (!isClock(time)) return new Response("time must look like 07:00", { status: 400 });
    return calendar(supabase, time, stamp);
  }

  if (type in CSV_TABLES) {
    const table = CSV_TABLES[type];
    const { rows, error } = await fetchAll(supabase, table, TABLES[table] ?? []);
    if (error) return new Response(error, { status: 500 });
    // Food: in the order you would read it, with its own columns. Includes day totals from quick add and imports.
    if (type === "food") return csvResponse(toCsv(rows, FOOD_COLUMNS), type, stamp);
    return csvResponse(toCsv(rows), type, stamp);
  }
  if (type !== "json") return new Response(`Unknown export type "${type}".`, { status: 400 });

  const out: Record<string, unknown> = {
    app: "Body IQ",
    exported_at: new Date().toISOString(),
    notes: "Dates are YYYY-MM-DD, times are UTC. Weights are in pounds, distances in metres or kilometres as named in each column. Garmin keys are never included.",
  };
  for (const [t, order] of Object.entries(TABLES)) {
    const { rows, error } = await fetchAll(supabase, t, order);
    out[t] = error ? { error } : rows.map(({ user_id, ...rest }) => (void user_id, rest));
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="body-iq-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

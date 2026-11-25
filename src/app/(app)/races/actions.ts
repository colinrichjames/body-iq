"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isIsoDate } from "@/lib/dates";
import { parseDuration } from "@/lib/hyrox";
import { generatePlan, RACE_TYPES } from "@/lib/plan";
import { getToday } from "@/lib/today";
import type { Race, RaceType } from "@/lib/types";

function fail(message: string): never {
  redirect(`/races?error=${encodeURIComponent(message)}`);
}

/** Replaces this race's not-yet-done generated workouts from today on with a fresh plan. */
async function applyPlan(race: Race): Promise<{ removed: number; added: number }> {
  const { supabase, userId } = await requireUser();
  const today = await getToday();
  if (race.race_date < today) fail("That race date has already passed.");

  const { data: removedRows, error: delError } = await supabase
    .from("workouts")
    .delete()
    .eq("race_id", race.id)
    .eq("generated", true)
    .eq("status", "planned")
    .gte("workout_date", today)
    .select("id");
  if (delError) fail(delError.message);

  // Don't pile onto days where the user already has something (their own sessions or another plan).
  const { data: existing } = await supabase
    .from("workouts")
    .select("workout_date")
    .gte("workout_date", today)
    .lte("workout_date", race.race_date);
  const taken = new Set((existing ?? []).map((w) => w.workout_date as string));

  let planned;
  try {
    planned = generatePlan({
      raceType: race.race_type,
      raceName: race.name,
      raceDate: race.race_date,
      startDate: today,
      priority: race.priority,
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Could not generate a plan.");
  }

  const rows = planned
    .filter((w) => !taken.has(w.workout_date))
    .map((w) => ({ ...w, user_id: userId, race_id: race.id, generated: true, status: "planned" }));

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("workouts").insert(rows.slice(i, i + 200));
    if (error) fail(error.message);
  }
  return { removed: removedRows?.length ?? 0, added: rows.length };
}

export async function addRace(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("race_type") ?? "");
  const date = String(formData.get("race_date") ?? "");
  const location = String(formData.get("location") ?? "").trim() || null;
  const goal = String(formData.get("goal") ?? "").trim() || null;

  const priority = String(formData.get("priority") ?? "A");
  const goalRaw = String(formData.get("goal_time") ?? "").trim();
  const goalSec = goalRaw ? parseDuration(goalRaw) : null;
  if (goalRaw && goalSec === null) fail("Goal time should look like 1:20:00 or 80 (minutes).");
  if (!name) fail("Give the race a name.");
  if (!RACE_TYPES.some((t) => t.value === type)) fail("Pick a race type.");
  if (!isIsoDate(date)) fail("Pick the race date.");

  const { data, error } = await supabase
    .from("races")
    .insert({ user_id: userId, name, race_type: type as RaceType, race_date: date, location, goal, priority: ["A", "B", "C"].includes(priority) ? priority : "B", goal_time_sec: goalSec })
    .select("*")
    .single<Race>();
  if (error || !data) fail(error?.message ?? "Could not save the race.");

  if (formData.get("generate") === "on") await applyPlan(data);

  revalidatePath("/races");
  revalidatePath("/workouts");
  revalidatePath("/dashboard");
  redirect("/races");
}

export async function regeneratePlan(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const { data } = await supabase.from("races").select("*").eq("id", id).single<Race>();
  if (!data) fail("Race not found.");
  await applyPlan(data);
  revalidatePath("/races");
  revalidatePath("/workouts");
  revalidatePath("/dashboard");
  redirect("/races");
}

export async function deleteRace(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const today = await getToday();
  // Remove the unfinished generated sessions; completed history stays (race_id becomes null).
  await supabase.from("workouts").delete().eq("race_id", id).eq("generated", true).eq("status", "planned").gte("workout_date", today);
  const { error } = await supabase.from("races").delete().eq("id", id);
  if (error) fail(error.message);
  revalidatePath("/races");
  revalidatePath("/workouts");
  revalidatePath("/dashboard");
  redirect("/races");
}

export async function addBenchmark(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const raceId = String(formData.get("race_id") ?? "");
  const station = String(formData.get("station") ?? "");
  const sec = parseDuration(String(formData.get("time") ?? ""));
  const date = String(formData.get("effort_date") ?? "");
  const back = (m: string) => redirect(`/races/${raceId}?error=${encodeURIComponent(m)}`);
  if (!sec) back("Enter a time like 4:45 (mm:ss).");
  if (!isIsoDate(date)) back("Pick a date.");
  const { error } = await supabase.from("hyrox_benchmarks").insert({
    user_id: userId,
    station,
    effort_date: date,
    time_sec: sec,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  if (error) back(error.message);
  revalidatePath(`/races/${raceId}`);
  redirect(`/races/${raceId}`);
}

export async function deleteBenchmark(formData: FormData) {
  const { supabase } = await requireUser();
  const raceId = String(formData.get("race_id") ?? "");
  await supabase.from("hyrox_benchmarks").delete().eq("id", String(formData.get("id") ?? ""));
  revalidatePath(`/races/${raceId}`);
  redirect(`/races/${raceId}`);
}

export type PlanCsvRow = {
  date: string;
  sport: string;
  title: string;
  duration_min: number | null;
  description: string;
};

const SPORTS = ["strength", "run", "bike", "swim", "hyrox", "mobility", "other"];

export async function importPlanRows(raceId: string, rows: PlanCsvRow[]): Promise<{ error: string | null; count: number }> {
  const { supabase, userId } = await requireUser();
  const { data: race } = await supabase.from("races").select("id").eq("id", raceId).maybeSingle();
  if (!race) return { error: "Race not found.", count: 0 };
  const clean = rows
    .filter((r) => isIsoDate(r.date) && r.title.trim())
    .slice(0, 800)
    .map((r) => ({
      user_id: userId,
      race_id: raceId,
      workout_date: r.date,
      sport: SPORTS.includes(r.sport) ? r.sport : "other",
      title: r.title.trim().slice(0, 200),
      description: r.description.trim().slice(0, 2000) || null,
      planned_duration_min: r.duration_min && r.duration_min > 0 ? Math.round(r.duration_min) : null,
      generated: false,
      status: "planned",
    }));
  if (clean.length === 0) return { error: "No valid rows (need date as YYYY-MM-DD and a title).", count: 0 };
  const { error } = await supabase.from("workouts").insert(clean);
  if (error) return { error: error.message, count: 0 };
  revalidatePath("/workouts");
  revalidatePath("/races");
  revalidatePath("/dashboard");
  return { error: null, count: clean.length };
}

/**
 * Realign after missed sessions (Runna-style): skip what was missed, or skip it and rebuild the
 * rest of the plan back from race day. Reports what changed.
 */
export async function realignPlan(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const mode = String(formData.get("mode") ?? "skip");
  const today = await getToday();
  const { data: race } = await supabase.from("races").select("*").eq("id", id).single<Race>();
  if (!race) fail("Race not found.");

  const { data: skipped } = await supabase
    .from("workouts")
    .update({ status: "skipped" })
    .eq("race_id", id)
    .eq("status", "planned")
    .lt("workout_date", today)
    .select("id");
  const nSkipped = skipped?.length ?? 0;

  let message = `Marked ${nSkipped} missed session${nSkipped === 1 ? "" : "s"} as skipped. The rest of the plan is unchanged.`;
  if (mode === "rebuild") {
    const { removed, added } = await applyPlan(race);
    message = `Marked ${nSkipped} missed session${nSkipped === 1 ? "" : "s"} as skipped, removed ${removed} upcoming planned sessions and added ${added}, rebuilt back from race day.`;
  }
  revalidatePath("/races");
  revalidatePath("/workouts");
  revalidatePath("/dashboard");
  redirect(`/workouts?notice=${encodeURIComponent(message)}`);
}

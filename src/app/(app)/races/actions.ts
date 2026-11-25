"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { toTrash, withUndo } from "@/lib/trash";
import { addDays, isIsoDate } from "@/lib/dates";
import { parseDuration } from "@/lib/hyrox";
import { generatePlan, RACE_TYPES } from "@/lib/plan";
import { planSummary, type PlanResult } from "@/lib/plan-summary";
import { affectsPlan, raceChanges, type RaceFields } from "@/lib/race-edit";
import { getToday } from "@/lib/today";
import type { Race, RaceType } from "@/lib/types";

function fail(message: string): never {
  redirect(`/races?error=${encodeURIComponent(message)}`);
}

/** Replaces this race's not-yet-done generated workouts from today on with a fresh plan. */
async function applyPlan(race: Race): Promise<PlanResult> {
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

  const kept = planned.filter((w) => !taken.has(w.workout_date));
  const skippedDays = new Set(planned.filter((w) => taken.has(w.workout_date)).map((w) => w.workout_date)).size;
  const rows = kept
    .map((w) => ({ ...w, user_id: userId, race_id: race.id, generated: true, status: "planned" }));

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("workouts").insert(rows.slice(i, i + 200));
    if (error) fail(error.message);
  }
  const dates = rows.map((r) => r.workout_date).sort();
  const weeks = new Set(rows.map((r) => addDays(r.workout_date, -((new Date(r.workout_date + "T00:00:00Z").getUTCDay() + 6) % 7)))).size;
  return { removed: removedRows?.length ?? 0, added: rows.length, skippedDays, first: dates[0] ?? null, last: dates.at(-1) ?? null, weeks };
}

/** Reads and validates the race form. Shared by add and edit. Failures go back to `back` with a message. */
function parseRace(formData: FormData, back: string): RaceFields {
  const bail = (m: string): never => redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(m)}`);
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("race_type") ?? "");
  const date = String(formData.get("race_date") ?? "");
  const priority = String(formData.get("priority") ?? "A");
  const goalRaw = String(formData.get("goal_time") ?? "").trim();
  const goalSec = goalRaw ? parseDuration(goalRaw) : null;
  if (goalRaw && goalSec === null) bail("Goal time should look like 1:20:00 or 80 (minutes).");
  if (!name) bail("Give the race a name.");
  if (!RACE_TYPES.some((t) => t.value === type)) bail("Pick a race type.");
  if (!isIsoDate(date)) bail("Pick the race date.");
  return {
    name,
    race_type: type as RaceType,
    race_date: date,
    location: String(formData.get("location") ?? "").trim() || null,
    goal: String(formData.get("goal") ?? "").trim() || null,
    priority: (["A", "B", "C"].includes(priority) ? priority : "B") as Race["priority"],
    goal_time_sec: goalSec,
  };
}

export async function addRace(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const fields = parseRace(formData, "/races");

  const { data, error } = await supabase
    .from("races")
    .insert({ user_id: userId, ...fields })
    .select("*")
    .single<Race>();
  if (error || !data) fail(error?.message ?? "Could not save the race.");

  const result = formData.get("generate") === "on" ? await applyPlan(data) : null;

  revalidatePath("/", "layout");
  redirect(flash("/races", result ? planSummary(result, "built") : "Race added. No plan built yet."));
}

/**
 * Edit a race after creating it. Moving the date, type or priority offers a plan rebuild (on by default). Completed
 * sessions and your own sessions are never touched. Without a rebuild, generated sessions that would fall after a
 * new, earlier race day are removed so nothing is planned past the race.
 */
export async function updateRace(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const back = `/races/${id}/edit`;
  const { data: before } = await supabase.from("races").select("*").eq("id", id).maybeSingle<Race>();
  if (!before) fail("Race not found.");
  const fields = parseRace(formData, back);
  const changes = raceChanges(before, fields);
  if (changes.length === 0) redirect(flash(`/races/${id}`, "No changes to save."));

  const { data: after, error } = await supabase.from("races").update(fields).eq("id", id).select("*").single<Race>();
  if (error || !after) redirect(`${back}?error=${encodeURIComponent(error?.message ?? "Could not save the race.")}`);

  const today = await getToday();
  const lines = [`Saved. ${changes.map((c) => c.text).join("; ")}.`];
  if (affectsPlan(changes)) {
    if (after.race_date < today) {
      lines.push("The race date is in the past, so the plan was not rebuilt.");
    } else if (formData.get("rebuild") === "on") {
      lines.push(planSummary(await applyPlan(after), "rebuilt"));
    } else {
      const { data: gone } = await supabase
        .from("workouts")
        .delete()
        .eq("race_id", id)
        .eq("generated", true)
        .eq("status", "planned")
        .gt("workout_date", after.race_date)
        .select("id");
      const n = gone?.length ?? 0;
      lines.push(n ? `Removed ${n} planned session${n === 1 ? "" : "s"} that fell after the new race day. The rest of the plan is unchanged; use Rebuild plan to re-plan it.` : "The plan was left as is. Use Rebuild plan to re-plan it.");
    }
  }
  revalidatePath("/", "layout");
  redirect(flash(`/races/${id}`, lines.join(" ")));
}

export async function regeneratePlan(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const { data } = await supabase.from("races").select("*").eq("id", id).single<Race>();
  if (!data) fail("Race not found.");
  const result = await applyPlan(data);
  revalidatePath("/", "layout");
  redirect(flash("/races", planSummary(result, "rebuilt")));
}

export async function deleteRace(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const today = await getToday();
  const { data: race } = await supabase.from("races").select("*").eq("id", id).maybeSingle<Race>();
  const { data: planned } = await supabase.from("workouts").select("*").eq("race_id", id).eq("generated", true).eq("status", "planned").gte("workout_date", today);
  const undo = race ? await toTrash(supabase, userId, "race", race.name, { race, workouts: planned ?? [] }) : null;
  // Remove the unfinished generated sessions; completed history stays (race_id becomes null).
  await supabase.from("workouts").delete().eq("race_id", id).eq("generated", true).eq("status", "planned").gte("workout_date", today);
  const { error } = await supabase.from("races").delete().eq("id", id);
  if (error) fail(error.message);
  revalidatePath("/", "layout");
  redirect(withUndo("/races", undo, race?.name ?? "Race"));
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
  revalidatePath("/", "layout");
  redirect(flash(`/races/${raceId}`, "Benchmark saved."));
}

export async function deleteBenchmark(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const raceId = String(formData.get("race_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const { data: benchmark } = await supabase.from("hyrox_benchmarks").select("*").eq("id", id).maybeSingle<{ station: string }>();
  const undo = benchmark ? await toTrash(supabase, userId, "benchmark", `${benchmark.station} benchmark`, { benchmark, race_id: raceId }) : null;
  await supabase.from("hyrox_benchmarks").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect(withUndo(`/races/${raceId}`, undo, benchmark ? `${benchmark.station} benchmark` : "Benchmark"));
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
  revalidatePath("/", "layout");
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
  revalidatePath("/", "layout");
  redirect(`/workouts?notice=${encodeURIComponent(message)}`);
}

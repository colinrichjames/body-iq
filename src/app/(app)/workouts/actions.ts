"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addDays, isIsoDate } from "@/lib/dates";
import { classify } from "@/lib/intensity";
import { nextEasyDay } from "@/lib/stacking";
import { getToday } from "@/lib/today";
import { buildStructure, exercisesFromForm } from "@/lib/structure";
import { hasProgress } from "@/lib/progress";
import type { BlockLog, SetLog, Workout, WorkoutStructure } from "@/lib/types";
import type { Sport } from "@/lib/types";

const SPORTS: Sport[] = ["strength", "run", "bike", "swim", "hyrox", "mobility", "other"];

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function refresh() {
  revalidatePath("/workouts");
  revalidatePath("/dashboard");
}

export async function addWorkout(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const sport = String(formData.get("sport") ?? "") as Sport;
  const date = String(formData.get("workout_date") ?? "");
  const back = (m: string) => redirect(`/workouts/new?error=${encodeURIComponent(m)}`);

  if (!title) back("Give the workout a title.");
  if (!SPORTS.includes(sport)) back("Pick a sport.");
  if (!isIsoDate(date)) back("Pick a date.");

  const { error } = await supabase.from("workouts").insert({
    user_id: userId,
    workout_date: date,
    sport,
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    planned_duration_min: numOrNull(formData.get("planned_duration_min")),
    structure: buildStructure(null, exercisesFromForm(formData), numOrNull(formData.get("rounds")), numOrNull(formData.get("rest_sec"))),
    generated: false,
    status: "planned",
  });
  if (error) back(error.message);

  refresh();
  redirect(`/workouts?d=${date}`);
}

export async function setStatus(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["planned", "completed", "skipped"].includes(status)) return;
  if (status === "planned") {
    // Reset throws away a half-finished session's partial sets too.
    const { data: cur } = await supabase.from("workouts").select("status").eq("id", id).maybeSingle<{ status: string }>();
    if (cur && cur.status !== "completed") await supabase.from("workout_sets").delete().eq("workout_id", id);
  }
  await supabase
    .from("workouts")
    .update({ status, progress: null, completed_at: status === "completed" ? new Date().toISOString() : null })
    .eq("id", id);
  refresh();
  redirect(`/workouts/${id}`);
}

export async function deleteWorkout(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("workouts").delete().eq("id", String(formData.get("id") ?? ""));
  refresh();
  redirect("/workouts");
}

export type { SetLog };

function cleanBlocks(blocks: BlockLog[] | undefined): BlockLog[] | null {
  if (!blocks?.length) return null;
  return blocks.slice(0, 60).map((b) => ({
    name: String(b.name ?? "").slice(0, 120),
    seconds: b.skipped || typeof b.seconds !== "number" || !Number.isFinite(b.seconds) ? null : Math.max(0, Math.round(b.seconds)),
    skipped: b.skipped === true,
  }));
}

export async function finishWorkout(input: {
  id: string;
  sets: SetLog[];
  actualMinutes: number | null;
  rpe: number | null;
  notes: string;
  distanceKm?: number | null;
  avgHr?: number | null;
  avgPower?: number | null;
  blocks?: BlockLog[];
}) {
  const { supabase, userId } = await requireUser();
  const rpe = input.rpe !== null && input.rpe >= 1 && input.rpe <= 10 ? Math.round(input.rpe) : null;

  const { error } = await supabase
    .from("workouts")
    .update({
      status: "completed",
      progress: null,
      block_results: cleanBlocks(input.blocks),
      completed_at: new Date().toISOString(),
      actual_duration_min: input.actualMinutes !== null ? Math.max(0, Math.round(input.actualMinutes)) : null,
      rpe,
      notes: input.notes.trim() || null,
      actual_distance_km: input.distanceKm && input.distanceKm > 0 && input.distanceKm < 1000 ? Math.round(input.distanceKm * 100) / 100 : null,
      avg_hr: input.avgHr && input.avgHr >= 30 && input.avgHr <= 250 ? Math.round(input.avgHr) : null,
      avg_power: input.avgPower && input.avgPower >= 0 && input.avgPower <= 3000 ? Math.round(input.avgPower) : null,
    })
    .eq("id", input.id);
  if (error) return { error: error.message };

  await supabase.from("workout_sets").delete().eq("workout_id", input.id);
  const rows = input.sets
    .filter((s) => s.exercise && s.set_number > 0)
    .slice(0, 500)
    .map((s) => ({
      user_id: userId,
      workout_id: input.id,
      exercise: s.exercise.slice(0, 120),
      set_number: s.set_number,
      reps: s.reps,
      weight_lb: s.weight_lb,
      rpe: s.rpe !== null && s.rpe !== undefined && s.rpe >= 1 && s.rpe <= 10 ? s.rpe : null,
      skipped: s.skipped === true,
    }));
  if (rows.length) {
    const { error: setError } = await supabase.from("workout_sets").insert(rows);
    if (setError) return { error: setError.message };
  }

  refresh();
  return { error: null };
}

/** Move a session to another day (free drag-and-drop, phone style). */
export async function moveWorkout(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!isIsoDate(date)) redirect(`/workouts/${id}?error=${encodeURIComponent("Pick a valid date.")}`);
  const { error } = await supabase.from("workouts").update({ workout_date: date }).eq("id", id);
  if (error) redirect(`/workouts/${id}?error=${encodeURIComponent(error.message)}`);
  refresh();
  redirect(`/workouts?d=${date}`);
}

/**
 * Readiness is low and today's session is hard: move it to the next day without a hard session.
 * If that day holds an easy session, bring it to today (a swap), so the load doesn't pile up.
 */
export async function swapHardSession(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const today = await getToday();
  const { data: win } = await supabase
    .from("workouts")
    .select("*")
    .gte("workout_date", today)
    .lte("workout_date", addDays(today, 4))
    .returns<Workout[]>();
  const all = win ?? [];
  const target = all.find((w) => w.id === id);
  if (!target || classify(target).level !== "hard") redirect("/dashboard");

  const to = nextEasyDay(all, today, 3);
  if (!to) redirect(`/dashboard?notice=${encodeURIComponent("No easy day in the next 3 days to swap into. Move it by hand on the workout page.")}`);

  const easyThere = all.filter((w) => w.workout_date === to && w.status === "planned" && classify(w).level === "easy");
  await supabase.from("workouts").update({ workout_date: to }).eq("id", id);
  for (const e of easyThere) await supabase.from("workouts").update({ workout_date: today }).eq("id", e.id);
  refresh();
  redirect(`/dashboard?notice=${encodeURIComponent(`Moved "${target.title}" to ${to}${easyThere.length ? ` and brought ${easyThere.map((e) => `"${e.title}"`).join(", ")} to today` : ""}.`)}`);
}

/** Customize a session. Edited sessions become yours (generated=false) so plan re-alignment never overwrites them. */
export async function updateWorkout(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const back = (m: string) => redirect(`/workouts/${id}/edit?error=${encodeURIComponent(m)}`);
  const title = String(formData.get("title") ?? "").trim();
  const sport = String(formData.get("sport") ?? "") as Sport;
  const date = String(formData.get("workout_date") ?? "");
  if (!title) back("Give the workout a title.");
  if (!SPORTS.includes(sport)) back("Pick a sport.");
  if (!isIsoDate(date)) back("Pick a date.");

  const { data: prev } = await supabase.from("workouts").select("structure").eq("id", id).maybeSingle<{ structure: WorkoutStructure | null }>();
  const structure = buildStructure(
    prev?.structure ?? null,
    exercisesFromForm(formData),
    numOrNull(formData.get("rounds")),
    numOrNull(formData.get("rest_sec")),
  );
  const { error } = await supabase
    .from("workouts")
    .update({
      title,
      sport,
      workout_date: date,
      description: String(formData.get("description") ?? "").trim() || null,
      planned_duration_min: numOrNull(formData.get("planned_duration_min")),
      structure,
      generated: false,
    })
    .eq("id", id);
  if (error) back(error.message);
  refresh();
  revalidatePath("/workouts/calendar");
  redirect(`/workouts/${id}`);
}

/** Copy a session to another day (planned, not generated). */
export async function duplicateWorkout(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!isIsoDate(date)) redirect(`/workouts/${id}?error=${encodeURIComponent("Pick a valid date.")}`);
  const { data: w } = await supabase.from("workouts").select("*").eq("id", id).maybeSingle<Workout>();
  if (!w) redirect("/workouts");
  const { data: copy, error } = await supabase
    .from("workouts")
    .insert({
      user_id: userId,
      workout_date: date,
      sport: w.sport,
      title: w.title,
      description: w.description,
      planned_duration_min: w.planned_duration_min,
      structure: w.structure,
      generated: false,
      status: "planned",
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !copy) redirect(`/workouts/${id}?error=${encodeURIComponent(error?.message ?? "Copy failed.")}`);
  refresh();
  revalidatePath("/workouts/calendar");
  redirect(`/workouts/${copy.id}`);
}

/** Drag-and-drop move. Returns instead of redirecting so the board can update in place. */
export async function rescheduleWorkout(id: string, date: string): Promise<{ error: string | null }> {
  const { supabase } = await requireUser();
  if (!isIsoDate(date)) return { error: "Invalid date." };
  const { error } = await supabase.from("workouts").update({ workout_date: date }).eq("id", id);
  if (error) return { error: error.message };
  refresh();
  revalidatePath("/workouts/calendar");
  return { error: null };
}

/** Complete a planned session from a synced Garmin activity: duration, distance, heart rate, power. */
export async function attachActivity(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const activityId = String(formData.get("activity_id") ?? "");
  const { data: a } = await supabase.from("activities").select("*").eq("id", activityId).maybeSingle();
  if (!a) redirect(`/workouts/${id}?error=${encodeURIComponent("Activity not found.")}`);
  const { error } = await supabase
    .from("workouts")
    .update({
      status: "completed",
      completed_at: a.started_at,
      activity_id: a.id,
      actual_duration_min: a.duration_sec ? Math.round(a.duration_sec / 60) : null,
      actual_distance_km: a.distance_m ? Math.round(Number(a.distance_m) / 10) / 100 : null,
      avg_hr: a.avg_hr,
      avg_power: a.avg_power,
    })
    .eq("id", id);
  if (error) redirect(`/workouts/${id}?error=${encodeURIComponent(error.message)}`);
  refresh();
  revalidatePath("/workouts/calendar");
  redirect(`/workouts/${id}`);
}

/** Called as the player advances and when it closes: keeps logged sets and the resume point on the server. */
export async function saveProgress(input: {
  id: string;
  sets: SetLog[];
  stepIndex: number;
  blockIndex: number;
  elapsedMs: number;
  blocks?: BlockLog[];
}): Promise<{ error: string | null }> {
  const { supabase, userId } = await requireUser();
  const { data: w } = await supabase.from("workouts").select("status").eq("id", input.id).maybeSingle<{ status: string }>();
  if (!w) return { error: "Workout not found." };
  if (w.status === "completed") return { error: null };

  const sets = input.sets.filter((x) => x.exercise && x.set_number > 0).slice(0, 500);
  const elapsedMs = Math.max(0, Math.min(Math.round(input.elapsedMs), 24 * 3600 * 1000));
  const blockIndex = Math.max(0, Math.round(input.blockIndex));
  if (!hasProgress({ sets: sets.length, blockIndex, elapsedMs })) {
    // Stepped all the way back: nothing left worth keeping, so the session returns to planned.
    if (w.status === "in_progress") {
      await supabase.from("workout_sets").delete().eq("workout_id", input.id);
      await supabase.from("workouts").update({ status: "planned", progress: null }).eq("id", input.id);
      refresh();
      revalidatePath(`/workouts/${input.id}`);
    }
    return { error: null };
  }

  const { error } = await supabase
    .from("workouts")
    .update({
      status: "in_progress",
      progress: { stepIndex: Math.max(0, Math.round(input.stepIndex)), blockIndex, elapsedMs, updatedAt: new Date().toISOString(), blocks: cleanBlocks(input.blocks) ?? [] },
    })
    .eq("id", input.id);
  if (error) return { error: error.message };

  await supabase.from("workout_sets").delete().eq("workout_id", input.id);
  if (sets.length) {
    const { error: setError } = await supabase.from("workout_sets").insert(
      sets.map((x) => ({
        user_id: userId,
        workout_id: input.id,
        exercise: x.exercise.slice(0, 120),
        set_number: x.set_number,
        reps: x.reps,
        weight_lb: x.weight_lb,
        rpe: x.rpe !== null && x.rpe !== undefined && x.rpe >= 1 && x.rpe <= 10 ? x.rpe : null,
        skipped: x.skipped === true,
      })),
    );
    if (setError) return { error: setError.message };
  }
  refresh();
  revalidatePath("/workouts/calendar");
  revalidatePath(`/workouts/${input.id}`);
  return { error: null };
}

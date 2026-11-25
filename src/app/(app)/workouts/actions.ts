"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addDays, isIsoDate } from "@/lib/dates";
import { classify } from "@/lib/intensity";
import { nextEasyDay } from "@/lib/stacking";
import { getToday } from "@/lib/today";
import type { Workout } from "@/lib/types";
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
  await supabase
    .from("workouts")
    .update({ status, completed_at: status === "completed" ? new Date().toISOString() : null })
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

export type SetLog = { exercise: string; set_number: number; reps: number | null; weight_lb: number | null };

export async function finishWorkout(input: {
  id: string;
  sets: SetLog[];
  actualMinutes: number | null;
  rpe: number | null;
  notes: string;
}) {
  const { supabase, userId } = await requireUser();
  const rpe = input.rpe !== null && input.rpe >= 1 && input.rpe <= 10 ? Math.round(input.rpe) : null;

  const { error } = await supabase
    .from("workouts")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      actual_duration_min: input.actualMinutes !== null ? Math.max(0, Math.round(input.actualMinutes)) : null,
      rpe,
      notes: input.notes.trim() || null,
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

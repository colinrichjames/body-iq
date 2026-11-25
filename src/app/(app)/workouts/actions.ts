"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isIsoDate } from "@/lib/dates";
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

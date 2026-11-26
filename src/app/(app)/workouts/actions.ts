"use server";

import { flash } from "@/lib/flash";
import { toTrash, withUndo } from "@/lib/trash";
import { isUnit, sessionPaceProblem, toKm, type DistUnit } from "@/lib/distance";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addDays, formatDay, isIsoDate } from "@/lib/dates";
import { planMissed } from "@/lib/adherence";
import { classify } from "@/lib/intensity";
import { nextEasyDay } from "@/lib/stacking";
import { getToday } from "@/lib/today";
import { buildStructure, exercisesFromForm } from "@/lib/structure";
import { quickTitle } from "@/lib/quick-start";
import { hasProgress } from "@/lib/progress";
import { plannedSetLogs } from "@/lib/lifting";
import { revertStructure, swapStructure } from "@/lib/hyrox-swaps";
import { insightsText, sessionInsights } from "@/lib/session-insights";
import type { BlockLog, SetLog, Workout, WorkoutStructure } from "@/lib/types";
import type { Sport } from "@/lib/types";
import { dbError } from "@/lib/db-error";
import { loadHistory } from "@/lib/progression-data";
import { suggestNext } from "@/lib/progression";
import { copyRow } from "@/lib/workout-copy";
import { adaptationOffer, trimmed, type AW } from "@/lib/missed-offer";

const SPORTS: Sport[] = ["strength", "run", "bike", "swim", "hyrox", "mobility", "other"];

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Planned distance typed in mi or km, stored as km (4 decimals) with the unit the user picked. */
function distanceFields(formData: FormData) {
  const unit = isUnit(formData.get("distance_unit")) ? (formData.get("distance_unit") as DistUnit) : "mi";
  const v = numOrNull(String(formData.get("planned_distance") ?? "").replace(",", "."));
  return { planned_distance_km: v !== null && v > 0 && v < 1000 ? toKm(v, unit) : null, distance_unit: unit };
}

function refresh() {
  // "layout" covers History, Calendar and every workout page under /workouts, not only the list.
  revalidatePath("/", "layout");
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
  const paceIssue = sessionPaceProblem(sport, numOrNull(formData.get("planned_duration_min")), distanceFields(formData).planned_distance_km, String(formData.get("title") ?? ""));
  if (paceIssue) back(paceIssue);

  const { error } = await supabase.from("workouts").insert({
    user_id: userId,
    workout_date: date,
    sport,
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    planned_duration_min: numOrNull(formData.get("planned_duration_min")),
    ...distanceFields(formData),
    structure: buildStructure(null, exercisesFromForm(formData), numOrNull(formData.get("rounds")), numOrNull(formData.get("rest_sec"))),
    generated: false,
    status: "planned",
  });
  if (error) back(dbError(error, true));

  refresh();
  redirect(flash(`/workouts?d=${date}`, "Workout added."));
}

export async function setStatus(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["planned", "completed", "skipped"].includes(status)) return;
  if (status === "completed") {
    // Mark done records the planned numbers as done, so an impossible pace is blocked here too.
    const { data: cur } = await supabase.from("workouts").select("sport,title,planned_duration_min,planned_distance_km").eq("id", id).maybeSingle<{ sport: string; title: string; planned_duration_min: number | null; planned_distance_km: number | null }>();
    const issue = cur ? sessionPaceProblem(cur.sport, cur.planned_duration_min, cur.planned_distance_km, cur.title) : null;
    if (issue) redirect(flash(`/workouts/${id}`, `${issue} Edit the workout first.`));
  }
  if (status === "planned") {
    // Reset throws away a half-finished session's partial sets too.
    const { data: cur } = await supabase.from("workouts").select("status").eq("id", id).maybeSingle<{ status: string }>();
    if (cur && cur.status !== "completed") await supabase.from("workout_sets").delete().eq("workout_id", id);
  }
  await supabase
    .from("workouts")
    .update({ status, progress: null, completed_at: status === "completed" ? new Date().toISOString() : null })
    .eq("id", id);

  let extra = "";
  if (status === "completed") extra = await recordPlannedSets(supabase, userId, id);
  refresh();
  const said = { completed: "Marked done.", skipped: "Marked skipped.", planned: "Reset to planned." }[status];
  redirect(flash(`/workouts/${id}`, `${said ?? "Updated."}${extra}`));
}

/**
 * "Mark done" means you did the plan, so record the planned sets as real sets (planned weight, or the last weight you
 * used) unless sets are already logged. Then report PRs and next weights. Never blocks the status change.
 */
async function recordPlannedSets(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string, id: string): Promise<string> {
  try {
    const { data: w } = await supabase.from("workouts").select("*").eq("id", id).maybeSingle<Workout>();
    const exercises = w?.structure?.exercises ?? [];
    if (!w || !exercises.length) return "";
    const { count } = await supabase.from("workout_sets").select("id", { count: "exact", head: true }).eq("workout_id", id);
    if ((count ?? 0) > 0) return "";

    const names = exercises.map((e) => e.name);
    const lastWeights: Record<string, number> = {};
    const { data: prev } = await supabase
      .from("workout_sets")
      .select("exercise, weight_lb")
      .in("exercise", names)
      .neq("workout_id", id)
      .not("weight_lb", "is", null)
      .order("created_at", { ascending: false })
      .limit(300);
    for (const r of prev ?? []) if (!(r.exercise in lastWeights)) lastWeights[r.exercise] = Number(r.weight_lb);

    const logs = plannedSetLogs(exercises, w.structure?.rounds, lastWeights);
    const { error } = await supabase.from("workout_sets").insert(
      logs.map((l) => ({ user_id: userId, workout_id: id, exercise: l.exercise.slice(0, 120), set_number: l.set_number, reps: l.reps, weight_lb: l.weight_lb, rpe: null, skipped: false })),
    );
    if (error) return "";
    const ins = await sessionInsights(supabase, w, logs);
    return ` Recorded ${logs.length} planned set${logs.length === 1 ? "" : "s"}.${insightsText(ins)}`;
  } catch {
    return "";
  }
}

export async function deleteWorkout(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const { data: workout } = await supabase.from("workouts").select("*").eq("id", id).maybeSingle<{ id: string; title: string }>();
  let undo: string | null = null;
  if (workout) {
    const { data: sets } = await supabase.from("workout_sets").select("*").eq("workout_id", id);
    undo = await toTrash(supabase, userId, "workout", workout.title, { workout, sets: sets ?? [] });
  }
  await supabase.from("workout_sets").delete().eq("workout_id", id);
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) {
    console.error("deleteWorkout failed", error.message);
    redirect(flash(`/workouts/${id}`, "Couldn't delete the workout. Please try again."));
  }
  refresh();
  redirect(withUndo("/workouts", undo, workout?.title ?? "Workout"));
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

const cleanNote = (n: unknown): string | null => (typeof n === "string" && n.trim() ? n.trim().slice(0, 200) : null);

function cleanOrder(order: string[] | undefined): string[] | null {
  if (!Array.isArray(order) || !order.length) return null;
  return order.filter((k) => typeof k === "string").slice(0, 500).map((k) => k.slice(0, 160));
}

function cleanTotals(totals: Record<string, number> | undefined): Record<string, number> | null {
  if (!totals || typeof totals !== "object") return null;
  const out: Record<string, number> = {};
  for (const [name, n] of Object.entries(totals).slice(0, 40)) if (typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 20) out[name.slice(0, 120)] = Math.round(n);
  return Object.keys(out).length ? out : null;
}

/** In-session intake, validated to the database limits. Blank or invalid means not logged. */
function fuelFields(carbs: unknown, fluid: unknown, sodium: unknown) {
  const n = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
  const c = n(carbs, 1000);
  const f = n(fluid, 10000);
  const so = n(sodium, 20000);
  return { fuel_carbs_g: c === null ? null : Math.round(c * 10) / 10, fluid_ml: f === null ? null : Math.round(f), sodium_mg: so === null ? null : Math.round(so) };
}

export async function finishWorkout(input: {
  id: string;
  sets: SetLog[];
  actualMinutes: number | null;
  rpe: number | null;
  notes: string;
  distanceKm?: number | null;
  distanceUnit?: DistUnit;
  avgHr?: number | null;
  avgPower?: number | null;
  fuelCarbsG?: number | null;
  fluidMl?: number | null;
  sodiumMg?: number | null;
  blocks?: BlockLog[];
}): Promise<{ error: string | null; message?: string }> {
  const { supabase, userId } = await requireUser();
  const rpe = input.rpe !== null && input.rpe >= 1 && input.rpe <= 10 ? Math.round(input.rpe) : null;

  const { data: cur } = await supabase.from("workouts").select("sport,title").eq("id", input.id).maybeSingle<{ sport: string; title: string }>();
  const km = input.distanceKm && input.distanceKm > 0 && input.distanceKm < 1000 ? Math.round(input.distanceKm * 10000) / 10000 : null;
  const problem = cur ? sessionPaceProblem(cur.sport, input.actualMinutes, km, cur.title) : null;
  if (problem) return { error: problem };

  const { error } = await supabase
    .from("workouts")
    .update({
      status: "completed",
      ...(input.distanceUnit && isUnit(input.distanceUnit) ? { distance_unit: input.distanceUnit } : {}),
      progress: null,
      block_results: cleanBlocks(input.blocks),
      completed_at: new Date().toISOString(),
      actual_duration_min: input.actualMinutes !== null ? Math.max(0, Math.round(input.actualMinutes)) : null,
      rpe,
      notes: input.notes.trim() || null,
      actual_distance_km: km,
      avg_hr: input.avgHr && input.avgHr >= 30 && input.avgHr <= 250 ? Math.round(input.avgHr) : null,
      avg_power: input.avgPower && input.avgPower >= 0 && input.avgPower <= 3000 ? Math.round(input.avgPower) : null,
      ...fuelFields(input.fuelCarbsG, input.fluidMl, input.sodiumMg),
    })
    .eq("id", input.id);
  if (error) return { error: dbError(error, true) };

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
      note: cleanNote(s.note),
    }));
  if (rows.length) {
    const { error: setError } = await supabase.from("workout_sets").insert(rows);
    if (setError) return { error: setError.message };
  }

  let message = "";
  try {
    const { data: w } = await supabase.from("workouts").select("id,workout_date,structure").eq("id", input.id).maybeSingle<Pick<Workout, "id" | "workout_date" | "structure">>();
    if (w) message = insightsText(await sessionInsights(supabase, w, input.sets)).trim();
  } catch {
    // insights are a bonus; the workout is already saved
  }
  refresh();
  return { error: null, message };
}

/** Move a session to another day (free drag-and-drop, phone style). */
export async function moveWorkout(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!isIsoDate(date)) redirect(`/workouts/${id}?error=${encodeURIComponent("Pick a valid date.")}`);
  const { error } = await supabase.from("workouts").update({ workout_date: date }).eq("id", id);
  if (error) redirect(`/workouts/${id}?error=${encodeURIComponent(dbError(error, true))}`);
  refresh();
  redirect(flash(`/workouts?d=${date}`, "Workout moved."));
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
  const paceIssue = sessionPaceProblem(sport, numOrNull(formData.get("planned_duration_min")), distanceFields(formData).planned_distance_km, String(formData.get("title") ?? ""));
  if (paceIssue) back(paceIssue);

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
      ...distanceFields(formData),
      structure,
      generated: false,
    })
    .eq("id", id);
  if (error) back(dbError(error, true));
  refresh();
  revalidatePath("/", "layout");
  redirect(flash(`/workouts/${id}`, "Changes saved."));
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
    .insert(copyRow(w, userId, date))
    .select("id")
    .single<{ id: string }>();
  if (error || !copy) redirect(`/workouts/${id}?error=${encodeURIComponent(error ? dbError(error, true) : "Copy failed.")}`);
  refresh();
  revalidatePath("/", "layout");
  redirect(flash(`/workouts/${copy.id}`, "Copied to the new date."));
}

/** Drag-and-drop move. Returns instead of redirecting so the board can update in place. */
export async function rescheduleWorkout(id: string, date: string): Promise<{ error: string | null }> {
  const { supabase } = await requireUser();
  if (!isIsoDate(date)) return { error: "Invalid date." };
  const { error } = await supabase.from("workouts").update({ workout_date: date }).eq("id", id);
  if (error) return { error: dbError(error, true) };
  refresh();
  revalidatePath("/", "layout");
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
  if (error) redirect(`/workouts/${id}?error=${encodeURIComponent(dbError(error, true))}`);
  refresh();
  revalidatePath("/", "layout");
  redirect(flash(`/workouts/${id}`, "Garmin activity attached."));
}

/** Called as the player advances and when it closes: keeps logged sets and the resume point on the server. */
export async function saveProgress(input: {
  id: string;
  sets: SetLog[];
  stepIndex: number;
  blockIndex: number;
  elapsedMs: number;
  blocks?: BlockLog[];
  order?: string[];
  totals?: Record<string, number>;
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
      revalidatePath("/", "layout");
    }
    return { error: null };
  }

  const { error } = await supabase
    .from("workouts")
    .update({
      status: "in_progress",
      progress: { stepIndex: Math.max(0, Math.round(input.stepIndex)), blockIndex, elapsedMs, updatedAt: new Date().toISOString(), blocks: cleanBlocks(input.blocks) ?? [], ...(cleanOrder(input.order) ? { order: cleanOrder(input.order) } : {}), ...(cleanTotals(input.totals) ? { totals: cleanTotals(input.totals) } : {}) },
    })
    .eq("id", input.id);
  if (error) return { error: dbError(error, true) };

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
        note: cleanNote(x.note),
      })),
    );
    if (setError) return { error: setError.message };
  }
  refresh();
  revalidatePath("/", "layout");
  return { error: null };
}

/**
 * Deal with planned sessions whose day has passed. "adapt" moves at most two important recent ones to free days and
 * skips the rest; "skip" skips everything. Computed here from the database, not from what the page showed.
 */
export async function adaptMissed(formData: FormData) {
  const { supabase } = await requireUser();
  const mode = String(formData.get("mode") ?? "adapt") === "skip" ? "skip" : "adapt";
  const today = await getToday();
  const { data } = await supabase
    .from("workouts")
    .select("id,workout_date,status,title,sport,race_id,planned_duration_min")
    .gte("workout_date", addDays(today, -13))
    .lte("workout_date", addDays(today, 7))
    .returns<Pick<Workout, "id" | "workout_date" | "status" | "title" | "sport" | "race_id" | "planned_duration_min">[]>();
  const rows = data ?? [];
  const raceIds = [...new Set(rows.map((w) => w.race_id).filter((x): x is string => !!x))];
  const raceDates: Record<string, string> = {};
  if (raceIds.length) {
    const { data: races } = await supabase.from("races").select("id,race_date").in("id", raceIds);
    for (const r of races ?? []) raceDates[r.id as string] = r.race_date as string;
  }
  const plan = planMissed(rows, today, raceDates);
  const moves = mode === "adapt" ? plan.moves : [];
  const skipIds = mode === "adapt" ? plan.skips.map((s) => s.id) : plan.missed.map((s) => s.id);

  for (const m of moves) {
    const { error } = await supabase.from("workouts").update({ workout_date: m.to }).eq("id", m.id).eq("status", "planned");
    if (error) redirect(flash("/workouts", `Couldn't move ${m.title}. ${dbError(error)}`));
  }
  if (skipIds.length) {
    const { error } = await supabase.from("workouts").update({ status: "skipped" }).in("id", skipIds);
    if (error) redirect(flash("/workouts", dbError(error, true)));
  }
  const plural = (n: number) => `${n} session${n === 1 ? "" : "s"}`;
  const parts: string[] = [];
  if (moves.length) parts.push(`Moved ${moves.map((m) => `${m.title} to ${formatDay(m.to)}`).join(" and ")}`);
  if (skipIds.length) parts.push(`${moves.length ? "skipped" : "Skipped"} ${plural(skipIds.length)}`);
  revalidatePath("/", "layout");
  redirect(flash("/workouts", parts.length ? `${parts.join(", ")}.` : "Nothing was missed."));
}

/** The offer for a skipped or missed plan session, computed from the database (never from what the page showed). */
async function currentOffer(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], today: string, id: string) {
  const { data } = await supabase
    .from("workouts")
    .select("id,workout_date,status,title,sport,race_id,planned_duration_min,generated,adaptation_handled_at")
    .gte("workout_date", addDays(today, -8))
    .lte("workout_date", addDays(today, 8))
    .returns<AW[]>();
  const rows = data ?? [];
  const raceIds = [...new Set(rows.map((w) => w.race_id).filter((x): x is string => !!x))];
  const raceDates: Record<string, string> = {};
  if (raceIds.length) {
    const { data: races } = await supabase.from("races").select("id,race_date").in("id", raceIds);
    for (const r of races ?? []) raceDates[r.id as string] = r.race_date as string;
  }
  const offer = adaptationOffer(rows, today, raceDates);
  return { offer: offer && offer.id === id ? offer : null, rows };
}

/** Accept the coach's one offer about a skipped or missed session: move it, trim next week, or drop it. */
export async function acceptAdaptation(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const today = await getToday();
  const { offer, rows } = await currentOffer(supabase, today, id);
  if (!offer) redirect(flash("/workouts", "That suggestion is no longer available."));
  const handled = new Date().toISOString();
  let message = "";
  if (offer.kind === "move" && offer.to) {
    const { error } = await supabase.from("workouts").update({ workout_date: offer.to, status: "planned", adaptation_handled_at: handled }).eq("id", id);
    if (error) redirect(flash("/workouts", `Couldn't move it. ${dbError(error)}`));
    message = `Moved ${offer.title} to ${formatDay(offer.to, { weekday: true })}.`;
  } else if (offer.kind === "trim" && offer.trimIds && offer.trimPct) {
    for (const t of rows.filter((r) => offer.trimIds!.includes(r.id))) {
      const { error } = await supabase.from("workouts").update({ planned_duration_min: trimmed(t.planned_duration_min ?? 0, offer.trimPct) }).eq("id", t.id).eq("status", "planned");
      if (error) redirect(flash("/workouts", `Couldn't trim the week. ${dbError(error)}`));
    }
    await supabase.from("workouts").update({ status: "skipped", adaptation_handled_at: handled }).eq("id", id);
    message = `Cut ${offer.trimIds.length} planned session${offer.trimIds.length === 1 ? "" : "s"} by ${offer.trimPct}%. ${offer.title} stays skipped.`;
  } else {
    await supabase.from("workouts").update({ status: "skipped", adaptation_handled_at: handled }).eq("id", id);
    message = `Dropped ${offer.title}. The plan is unchanged.`;
  }
  revalidatePath("/", "layout");
  redirect(flash("/workouts", message));
}

/** Dismiss the offer: nothing changes, and it isn't offered again. */
export async function dismissAdaptation(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const { error } = await supabase.from("workouts").update({ adaptation_handled_at: new Date().toISOString() }).eq("id", id);
  if (error) redirect(flash("/workouts", dbError(error, true)));
  revalidatePath("/", "layout");
  redirect(flash("/workouts", "Okay, the plan is unchanged."));
}

/**
 * Swap a Hyrox session's special-equipment stations (SkiErg, sleds, wall balls, sandbag) for classic-gym versions, or
 * switch back. scope "upcoming" applies to every planned Hyrox session from today on. The originals are kept so the
 * swap is always reversible.
 */
export async function setGymSwaps(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const on = String(formData.get("mode") ?? "on") === "on";
  const scope = String(formData.get("scope") ?? "one");
  const today = await getToday();

  let q = supabase.from("workouts").select("id,structure").eq("sport", "hyrox").neq("status", "completed");
  q = scope === "upcoming" ? q.gte("workout_date", today).eq("status", "planned") : q.eq("id", id);
  const { data } = await q.returns<{ id: string; structure: WorkoutStructure | null }[]>();

  let changed = 0;
  for (const w of data ?? []) {
    if (!w.structure?.blocks) continue;
    const next = on ? swapStructure(w.structure) : revertStructure(w.structure);
    if (JSON.stringify(next) === JSON.stringify(w.structure)) continue;
    const { error } = await supabase.from("workouts").update({ structure: next }).eq("id", w.id);
    if (error) redirect(flash(`/workouts/${id}`, dbError(error, true)));
    changed++;
  }
  revalidatePath("/", "layout");
  const what = on ? "Switched to gym versions" : "Back to the Hyrox stations";
  redirect(flash(`/workouts/${id}`, changed ? `${what} for ${changed} session${changed === 1 ? "" : "s"}.` : "Nothing to change."));
}

/** Log (or fix) what you took in during a session, after the fact. Blank fields clear that value. */
export async function logSessionFuel(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const val = (k: string) => {
    const t = String(formData.get(k) ?? "").trim();
    return t === "" ? null : Number(t);
  };
  const fields = fuelFields(val("fuel_carbs_g"), val("fluid_ml"), val("sodium_mg"));
  const { error } = await supabase.from("workouts").update(fields).eq("id", id);
  if (error) redirect(`/workouts/${id}?error=${encodeURIComponent(dbError(error, true))}`);
  revalidatePath("/", "layout");
  redirect(flash(`/workouts/${id}`, "Fuel and fluids saved."));
}

/**
 * Quick Start: create today's workout in one tap and open the player.
 * mode "empty" makes a bare timer session, "repeat" copies the last finished lifting session, otherwise the picked exercises are used.
 */
export async function startQuickWorkout(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const today = await getToday();
  const mode = String(formData.get("mode") ?? "pick");
  const hour = Number(formData.get("hour"));
  let title = quickTitle(Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 12);
  let structure: WorkoutStructure | null = null;
  const back = (m: string) => redirect(`/workouts/quick?error=${encodeURIComponent(m)}`);

  if (mode === "repeat") {
    const { data: last } = await supabase
      .from("workouts")
      .select("title,structure")
      .eq("status", "completed")
      .eq("sport", "strength")
      .order("workout_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(15)
      .returns<Pick<Workout, "title" | "structure">[]>();
    const found = (last ?? []).find((w) => (w.structure?.exercises?.length ?? 0) > 0);
    if (!found) back("No finished lifting session to repeat yet.");
    title = found!.title;
    structure = found!.structure;
  } else if (mode === "pick") {
    const exercises = exercisesFromForm(formData);
    if (!exercises.length) back("Pick at least one exercise, or start an empty workout.");
    structure = buildStructure(null, exercises, null, null);
  }

  const { data: created, error } = await supabase
    .from("workouts")
    .insert({ user_id: userId, workout_date: today, sport: "strength", title, structure, generated: false, status: "planned" })
    .select("id")
    .single<{ id: string }>();
  if (error || !created) back(error?.message ?? "Couldn't start the workout.");
  refresh();
  redirect(`/workouts/${created!.id}/start`);
}

/**
 * Adds an exercise to a session that is being played (the empty-workout case). Saved on the workout so a refresh
 * keeps it, and returns what the player needs to prefill: last time's sets and a history-based weight suggestion.
 */
export async function addPlayerExercise(
  id: string,
  nameRaw: string,
  sets = 3,
  reps = 10,
): Promise<{ error: string | null; lastWeight?: number; lastTime?: string; suggested?: { weight: number; text: string } }> {
  const { supabase } = await requireUser();
  const name = nameRaw.trim().slice(0, 80);
  if (!name) return { error: "Type or pick an exercise." };
  const nSets = Number.isFinite(sets) && sets >= 1 && sets <= 20 ? Math.round(sets) : 3;
  const nReps = Number.isFinite(reps) && reps >= 1 && reps <= 100 ? Math.round(reps) : 10;
  const { data: w } = await supabase.from("workouts").select("structure,workout_date").eq("id", id).maybeSingle<{ structure: WorkoutStructure | null; workout_date: string }>();
  if (!w) return { error: "Couldn't find that workout." };
  const list = w.structure?.exercises ?? [];
  if (!list.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
    const { error } = await supabase
      .from("workouts")
      .update({ structure: { ...(w.structure ?? {}), exercises: [...list, { name, sets: nSets, reps: nReps }] } })
      .eq("id", id);
    if (error) return { error: dbError(error) };
  }
  // What happened last time, and a suggested weight, the same way the planned player does it.
  const { data: rows } = await supabase
    .from("workout_sets")
    .select("weight_lb, reps, workout_id, set_number, created_at, skipped")
    .eq("exercise", name)
    .neq("workout_id", id)
    .order("created_at", { ascending: false })
    .limit(60);
  const done = (rows ?? []).filter((r) => !r.skipped);
  const lastId = done[0]?.workout_id;
  const lastSets = done.filter((r) => r.workout_id === lastId).sort((a, b) => a.set_number - b.set_number);
  const lastWeight = done.find((r) => r.weight_lb !== null)?.weight_lb;
  const lastTime = lastSets.map((r) => `${r.weight_lb !== null ? `${Number(r.weight_lb)} × ` : ""}${r.reps ?? "-"}`).join(", ");
  const hist = await loadHistory(supabase, w.workout_date, { names: [name], excludeId: id });
  const sug = suggestNext(name, hist[name] ?? [], nReps);
  return {
    error: null,
    ...(lastWeight !== undefined && lastWeight !== null ? { lastWeight: Number(lastWeight) } : {}),
    ...(lastTime ? { lastTime } : {}),
    ...(sug ? { suggested: { weight: sug.weight, text: `${sug.weight} lb: ${sug.reason}` } } : {}),
  };
}

import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { Workout, WorkoutSet } from "@/lib/types";
import { AssistantLoader } from "./assistant-loader";
import { hyroxBlockTargets } from "@/lib/context";
import { isHyrox } from "@/lib/hyrox";
import type { Race } from "@/lib/types";

export default async function StartWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: w } = await supabase.from("workouts").select("*").eq("id", id).maybeSingle<Workout>();
  if (!w) notFound();
  if (w.status === "completed") redirect(`/workouts/${id}`);

  // Pre-fill weights from the last time each exercise was logged.
  const names = (w.structure?.exercises ?? []).map((e) => e.name);
  const lastWeights: Record<string, number> = {};
  const lastTime: Record<string, string> = {};
  const lastVolume: Record<string, number> = {};
  if (names.length) {
    const { data } = await supabase
      .from("workout_sets")
      .select("exercise, weight_lb, reps, workout_id, set_number, created_at")
      .in("exercise", names)
      .neq("workout_id", id)
      .order("created_at", { ascending: false })
      .limit(400);
    const lastSession = new Map<string, string>();
    for (const r of data ?? []) {
      if (r.weight_lb !== null && !(r.exercise in lastWeights)) lastWeights[r.exercise] = Number(r.weight_lb);
      if (!lastSession.has(r.exercise)) lastSession.set(r.exercise, r.workout_id);
    }
    for (const [ex, wid] of lastSession) {
      const sets = (data ?? []).filter((r) => r.exercise === ex && r.workout_id === wid).sort((a, b) => a.set_number - b.set_number);
      lastVolume[ex] = sets.reduce((a, r) => a + (r.weight_lb !== null && r.reps !== null ? Number(r.weight_lb) * r.reps : 0), 0);
      lastTime[ex] = sets.map((r) => `${r.weight_lb !== null ? `${Number(r.weight_lb)} × ` : ""}${r.reps ?? "-"}`).join(", ");
    }
  }

  // Resume point saved on the server (sets already logged + where the player was).
  const { data: saved } = await supabase.from("workout_sets").select("*").eq("workout_id", id).order("created_at").returns<WorkoutSet[]>();
  const serverResume =
    w.status === "in_progress" && w.progress
      ? {
          logs: (saved ?? []).map((r) => ({ exercise: r.exercise, set_number: r.set_number, reps: r.reps, weight_lb: r.weight_lb !== null ? Number(r.weight_lb) : null, rpe: r.rpe !== null ? Number(r.rpe) : null, skipped: r.skipped })),
          blocks: w.progress.blocks ?? [],
          stepIndex: w.progress.stepIndex,
          blockIndex: w.progress.blockIndex,
          elapsedMs: w.progress.elapsedMs,
          order: w.progress.order,
          totals: w.progress.totals,
        }
      : null;

  // Previous completed session of the same sport, for the "vs last time" line on endurance finishes.
  let lastEndurance: { date: string; km: number | null; minutes: number | null } | null = null;
  if (["run", "bike", "swim", "hyrox"].includes(w.sport)) {
    const { data: prev } = await supabase
      .from("workouts")
      .select("workout_date,actual_distance_km,actual_duration_min")
      .eq("status", "completed")
      .eq("sport", w.sport)
      .neq("id", id)
      .order("workout_date", { ascending: false })
      .limit(1)
      .maybeSingle<{ workout_date: string; actual_distance_km: number | null; actual_duration_min: number | null }>();
    if (prev) lastEndurance = { date: prev.workout_date, km: prev.actual_distance_km !== null ? Number(prev.actual_distance_km) : null, minutes: prev.actual_duration_min };
  }

  // HYROX blocks show numeric targets from the next HYROX race that has a goal time.
  let targets: Record<string, number> = {};
  let targetRace: string | null = null;
  if (w.structure?.blocks?.length && w.sport === "hyrox") {
    const today = new Date().toISOString().slice(0, 10);
    const { data: races } = await supabase.from("races").select("*").gte("race_date", today).order("race_date").returns<Race[]>();
    const race = (races ?? []).find((r) => isHyrox(r.race_type) && r.goal_time_sec);
    if (race) {
      targets = hyroxBlockTargets(w.structure.blocks, race.goal_time_sec);
      targetRace = race.name;
    }
  }

  return <AssistantLoader workout={w} lastWeights={lastWeights} lastTime={lastTime} serverResume={serverResume} targets={targets} targetRace={targetRace} lastVolume={lastVolume} lastEndurance={lastEndurance} plannedDistanceKm={w.planned_distance_km !== null ? Number(w.planned_distance_km) : null} distanceUnit={w.distance_unit ?? "mi"} />;
}

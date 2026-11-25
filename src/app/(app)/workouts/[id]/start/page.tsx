import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { Workout, WorkoutSet } from "@/lib/types";
import { AssistantLoader } from "./assistant-loader";
import { hyroxBlockTargets } from "@/lib/context";
import { isHyrox } from "@/lib/hyrox";
import type { DailyHealth, Race, RecoveryCheckin } from "@/lib/types";
import { loadDeload, loadHistory } from "@/lib/progression-data";
import { loadStep, suggestNext } from "@/lib/progression";
import { adaptSession, adaptWeight, adaptedTotals } from "@/lib/adapt";
import { computeLoad } from "@/lib/load";
import { computeReadiness } from "@/lib/readiness";
import { addDays, startOfWeek } from "@/lib/dates";
import { mergeCheckins } from "@/lib/readiness";

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

  // History-based weight suggestions, with a lighter 90% load when the deload check says so.
  const suggested: Record<string, { weight: number; text: string }> = {};
  let deload = false;
  let adaptation = adaptSession(w, { readiness: null, load: null, deload: "none" });
  if (names.length) {
    const today = w.workout_date;
    const [{ data: hrows }, { data: crows }] = await Promise.all([
      supabase.from("daily_health").select("*").order("day", { ascending: false }).limit(14).returns<DailyHealth[]>(),
      supabase.from("recovery_checkins").select("day,sleep_hours,soreness,energy").order("day", { ascending: false }).limit(14).returns<RecoveryCheckin[]>(),
    ]);
    const health = mergeCheckins(hrows ?? [], crows ?? []);
    const check = await loadDeload(supabase, today, health);
    deload = check.level === "deload";
    const { data: recent } = await supabase.from("workouts").select("*").gte("workout_date", addDays(today, -90)).lte("workout_date", today).returns<Workout[]>();
    const weekStart = startOfWeek(today);
    const load = computeLoad(recent ?? [], today, weekStart, (recent ?? []).filter((x) => x.workout_date >= weekStart));
    adaptation = adaptSession(w, { readiness: computeReadiness(health), load, deload: check.level });
    const hist = await loadHistory(supabase, today, { names, excludeId: id });
    for (const e of w.structure?.exercises ?? []) {
      const target = typeof e.reps === "number" ? e.reps : 0;
      const sug = target ? suggestNext(e.name, hist[e.name] ?? [], target, { deload }) : null;
      if (sug) {
        const weight = adaptWeight(sug.weight, adaptation.factor, loadStep(e.name, sug.weight));
        suggested[e.name] = { weight, text: `${weight} lb: ${weight < sug.weight ? `${sug.weight} lb planned, trimmed for recovery` : sug.reason}` };
      }
    }
  }

  // Resume point saved on the server (sets already logged + where the player was).
  const { data: saved } = await supabase.from("workout_sets").select("*").eq("workout_id", id).order("created_at").returns<WorkoutSet[]>();
  const serverResume =
    w.status === "in_progress" && w.progress
      ? {
          logs: (saved ?? []).map((r) => ({ exercise: r.exercise, set_number: r.set_number, reps: r.reps, weight_lb: r.weight_lb !== null ? Number(r.weight_lb) : null, rpe: r.rpe !== null ? Number(r.rpe) : null, skipped: r.skipped, note: r.note })),
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

  return <AssistantLoader workout={w} lastWeights={lastWeights} lastTime={lastTime} serverResume={serverResume} targets={targets} targetRace={targetRace} lastVolume={lastVolume} suggested={suggested} deload={deload} adaptation={{ headline: adaptation.headline, reasons: adaptation.reasons, mode: adaptation.mode }} initialTotals={adaptedTotals(w, adaptation.setsDelta)} lastEndurance={lastEndurance} plannedDistanceKm={w.planned_distance_km !== null ? Number(w.planned_distance_km) : null} distanceUnit={w.distance_unit ?? "mi"} />;
}

import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { Workout, WorkoutSet } from "@/lib/types";
import { AssistantLoader } from "./assistant-loader";

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
      lastTime[ex] = sets.map((r) => `${r.weight_lb !== null ? `${Number(r.weight_lb)} × ` : ""}${r.reps ?? "-"}`).join(", ");
    }
  }

  // Resume point saved on the server (sets already logged + where the player was).
  const { data: saved } = await supabase.from("workout_sets").select("*").eq("workout_id", id).order("created_at").returns<WorkoutSet[]>();
  const serverResume =
    w.status === "in_progress" && w.progress
      ? {
          logs: (saved ?? []).map((r) => ({ exercise: r.exercise, set_number: r.set_number, reps: r.reps, weight_lb: r.weight_lb !== null ? Number(r.weight_lb) : null, rpe: r.rpe !== null ? Number(r.rpe) : null })),
          stepIndex: w.progress.stepIndex,
          blockIndex: w.progress.blockIndex,
          elapsedMs: w.progress.elapsedMs,
        }
      : null;

  return <AssistantLoader workout={w} lastWeights={lastWeights} lastTime={lastTime} serverResume={serverResume} />;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { plannedSetLogs } from "@/lib/lifting";
import { insightsText, sessionInsights } from "@/lib/session-insights";
import type { Workout } from "@/lib/types";

/**
 * "Mark done" means you did the plan, so record the planned sets as real sets (planned weight, or the last weight you
 * used) unless sets are already logged. Then report PRs and next weights. Never blocks the status change.
 */
export async function recordPlannedSets(supabase: SupabaseClient, userId: string, id: string): Promise<string> {
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


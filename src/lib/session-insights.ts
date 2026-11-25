import type { SupabaseClient } from "@supabase/supabase-js";
import { detectPRs, nextWeights, prText, type NextWeight, type PR } from "./lifting";
import type { SetLog, Workout } from "./types";

export type SessionInsights = { prs: PR[]; next: NextWeight[] };

/**
 * PRs and next-weight guidance for one logged session, compared with everything done on earlier days.
 * Returns empty lists if anything is missing; it never blocks saving a workout.
 */
export async function sessionInsights(supabase: SupabaseClient, workout: Pick<Workout, "id" | "workout_date" | "structure">, logs: SetLog[]): Promise<SessionInsights> {
  const names = [...new Set(logs.filter((l) => !l.skipped && l.weight_lb !== null).map((l) => l.exercise))];
  if (!names.length) return { prs: [], next: [] };
  const { data } = await supabase
    .from("workout_sets")
    .select("exercise, weight_lb, reps, skipped, workouts!inner(workout_date, status)")
    .in("exercise", names)
    .neq("workout_id", workout.id)
    .eq("workouts.status", "completed")
    .lt("workouts.workout_date", workout.workout_date)
    .limit(2000);
  const prior = (data ?? []).map((r) => ({ exercise: r.exercise as string, weight_lb: r.weight_lb === null ? null : Number(r.weight_lb), reps: r.reps as number | null, skipped: r.skipped as boolean }));
  const targets: Record<string, number | undefined> = {};
  for (const e of workout.structure?.exercises ?? []) targets[e.name] = e.reps;
  return { prs: detectPRs(prior, logs), next: nextWeights(logs, targets) };
}

/** One short sentence for a toast: PRs first, then how many exercises are ready to go up. */
export function insightsText(ins: SessionInsights): string {
  const parts: string[] = [];
  if (ins.prs.length) parts.push(`New PR: ${ins.prs.slice(0, 2).map(prText).join("; ")}${ins.prs.length > 2 ? ` and ${ins.prs.length - 2} more` : ""}.`);
  const up = ins.next.filter((n) => n.action === "up");
  if (up.length) parts.push(`Ready to go up: ${up.slice(0, 2).map((n) => `${n.exercise} to ${n.to} lb`).join(", ")}${up.length > 2 ? ` and ${up.length - 2} more` : ""}.`);
  return parts.length ? ` ${parts.join(" ")}` : "";
}

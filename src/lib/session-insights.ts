import type { SupabaseClient } from "@supabase/supabase-js";
import { detectPRs, nextWeights, prText, type NextWeight, type PR } from "./lifting";
import { groupHistory, loadHistory } from "./progression-data";
import { suggestNext, type HistSession } from "./progression";
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
  const fallback = nextWeights(logs, targets);
  return { prs: detectPRs(prior, logs), next: await historyNext(supabase, workout, logs, targets, fallback) };
}

/**
 * Next weights from the last 12 weeks of history with this session as the newest entry. Falls back to the
 * session-only rule for any lift the history engine can't advise on.
 */
async function historyNext(supabase: SupabaseClient, workout: Pick<Workout, "id" | "workout_date">, logs: SetLog[], targets: Record<string, number | undefined>, fallback: NextWeight[]): Promise<NextWeight[]> {
  const names = fallback.map((n) => n.exercise);
  if (!names.length) return fallback;
  const hist = await loadHistory(supabase, workout.workout_date, { names, excludeId: workout.id });
  const now = groupHistory(logs.map((l) => ({ exercise: l.exercise, weight_lb: l.weight_lb, reps: l.reps, rpe: l.rpe ?? null, skipped: l.skipped ?? false, workouts: { workout_date: workout.workout_date } })));
  return fallback.map((f) => {
    const sessions: HistSession[] = [...(now[f.exercise] ?? []), ...(hist[f.exercise] ?? []).filter((s) => s.date !== workout.workout_date)];
    const target = targets[f.exercise];
    const sug = target ? suggestNext(f.exercise, sessions, target) : null;
    if (!sug) return f;
    return { exercise: f.exercise, from: sug.from, to: sug.weight, action: sug.weight > sug.from ? "up" : sug.weight < sug.from ? "down" : "same", reason: sug.reason };
  });
}

/** One short sentence for a toast: PRs first, then how many exercises are ready to go up. */
export function insightsText(ins: SessionInsights): string {
  const parts: string[] = [];
  if (ins.prs.length) parts.push(`New PR: ${ins.prs.slice(0, 2).map(prText).join("; ")}${ins.prs.length > 2 ? ` and ${ins.prs.length - 2} more` : ""}.`);
  const up = ins.next.filter((n) => n.action === "up");
  if (up.length) parts.push(`Ready to go up: ${up.slice(0, 2).map((n) => `${n.exercise} to ${n.to} lb`).join(", ")}${up.length > 2 ? ` and ${up.length - 2} more` : ""}.`);
  return parts.length ? ` ${parts.join(" ")}` : "";
}

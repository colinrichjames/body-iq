import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "./dates";
import { deloadCheck, type DeloadCheck, type HistSession } from "./progression";
import { lowReadinessDays } from "./readiness";
import type { HealthDay } from "./types";

type Row = { exercise: string; weight_lb: number | string | null; reps: number | null; rpe: number | string | null; skipped: boolean; workouts: { workout_date: string } | { workout_date: string }[] | null };

/** Groups set rows into per-exercise sessions (one per day), newest first, keeping only finished weighted sets. */
export function groupHistory(rows: Row[]): Record<string, HistSession[]> {
  const out: Record<string, Map<string, HistSession>> = {};
  for (const r of rows) {
    const w = Array.isArray(r.workouts) ? r.workouts[0] : r.workouts;
    if (w && r.skipped) {
      const sk = (out[r.exercise] ??= new Map());
      const cur = sk.get(w.workout_date) ?? { date: w.workout_date, sets: [] };
      cur.skipped = (cur.skipped ?? 0) + 1;
      sk.set(w.workout_date, cur);
    }
    const weight = r.weight_lb === null ? 0 : Number(r.weight_lb);
    if (!w || r.skipped || !(weight > 0) || r.reps === null || r.reps < 1) continue;
    const byDate = (out[r.exercise] ??= new Map());
    const s = byDate.get(w.workout_date) ?? { date: w.workout_date, sets: [] };
    s.sets.push({ weight, reps: r.reps, rpe: r.rpe === null ? null : Number(r.rpe) });
    byDate.set(w.workout_date, s);
  }
  return Object.fromEntries(Object.entries(out).map(([k, m]) => [k, [...m.values()].sort((a, b) => (a.date < b.date ? 1 : -1))]));
}

/**
 * Completed, weighted sets from the last `days` days, by exercise. `names` limits it to those lifts; `excludeId` skips
 * one workout (the one being planned or finished). Returns {} on any error: advice never blocks the page.
 */
export async function loadHistory(supabase: SupabaseClient, today: string, opts: { names?: string[]; days?: number; excludeId?: string } = {}): Promise<Record<string, HistSession[]>> {
  try {
    let q = supabase
      .from("workout_sets")
      .select("exercise, weight_lb, reps, rpe, skipped, workouts!inner(workout_date, status)")
      .eq("workouts.status", "completed")
      .gte("workouts.workout_date", addDays(today, -(opts.days ?? 84)))
      .limit(3000);
    if (opts.names?.length) q = q.in("exercise", opts.names);
    if (opts.excludeId) q = q.neq("workout_id", opts.excludeId);
    const { data } = await q;
    return groupHistory((data ?? []) as unknown as Row[]);
  } catch {
    return {};
  }
}

/** Deload call across every lift with enough history, using recent readiness from the merged health rows. */
export async function loadDeload(supabase: SupabaseClient, today: string, health: HealthDay[]): Promise<DeloadCheck> {
  const hist = await loadHistory(supabase, today);
  return deloadCheck(hist, lowReadinessDays(health));
}

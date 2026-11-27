import type { SupabaseClient } from "@supabase/supabase-js";
import { downgradeProposal, type CtxWorkout } from "@/lib/coach-actions";
import type { ActionCard } from "@/lib/coach-chat";
import { addDays } from "@/lib/dates";
import { loadNutritionDays } from "@/lib/nutrition-data";
import { reviewWeek, weeklyReview } from "@/lib/weekly-review";
import type { Reply } from "@/lib/coach-chat";
import type { Profile } from "@/lib/types";
import { classify } from "@/lib/intensity";
import { computeReadiness, mergeCheckins, type Readiness } from "@/lib/readiness";
import type { DailyHealth, RecoveryCheckin } from "@/lib/types";

const COLS = "id,title,sport,status,workout_date,structure,planned_duration_min,planned_distance_km,race_id,generated";

export type Downgrade = { readiness: Readiness; workout: CtxWorkout };

/** Today's readiness and hard planned session. Returns a result only when readiness is amber or red AND a hard session is waiting. */
export async function findDowngrade(db: SupabaseClient, today: string): Promise<Downgrade | null> {
  const [health, checks, wk] = await Promise.all([
    db.from("daily_health").select("*").order("day", { ascending: false }).limit(14).returns<DailyHealth[]>(),
    db.from("recovery_checkins").select("day,sleep_hours,soreness,energy").order("day", { ascending: false }).limit(14).returns<RecoveryCheckin[]>(),
    db.from("workouts").select(COLS).eq("workout_date", today).eq("status", "planned").returns<CtxWorkout[]>(),
  ]);
  const readiness = computeReadiness(mergeCheckins(health.data ?? [], checks.data ?? []));
  if (!readiness || readiness.day !== today || readiness.status === "green") return null;
  const workout = (wk.data ?? []).find((w) => classify(w).level === "hard");
  return workout ? { readiness, workout } : null;
}

/** The "make it easier" card for that session. Re-uses an open one so asking twice doesn't pile up proposals. */
export async function downgradeCard(db: SupabaseClient, d: Downgrade): Promise<ActionCard | null> {
  const p = downgradeProposal(d.workout);
  if (!p) return null;
  const { data: open } = await db.from("coach_actions").select("id").eq("kind", "downgrade").eq("status", "proposed").eq("params->>id", d.workout.id).limit(1).maybeSingle<{ id: string }>();
  if (open) return { id: open.id, title: p.title, lines: p.lines, status: "proposed" };
  const { data, error } = await db.from("coach_actions").insert({ kind: p.kind, summary: p.title, params: p.params, status: "proposed" }).select("id").single<{ id: string }>();
  if (error || !data) return null;
  return { id: data.id, title: p.title, lines: p.lines, status: "proposed" };
}

export const offerText = (d: Downgrade) => `Your readiness is ${d.readiness.status} today and ${d.workout.title} is a hard session. Want me to make it easier? Your call, nothing changes unless you confirm.`;

/** The review of the last full Monday-Sunday week, from what was logged. Null when nothing was logged. */
export async function loadReview(db: SupabaseClient, userId: string, today: string): Promise<Reply | null> {
  const { start, end } = reviewWeek(today);
  const [wk, nutrition, checks, weigh, scans, profile] = await Promise.all([
    db.from("workouts").select("workout_date,status,title,planned_duration_min,actual_duration_min").gte("workout_date", start).lte("workout_date", end),
    loadNutritionDays(db, start),
    db.from("recovery_checkins").select("day,sleep_hours,soreness,energy").gte("day", start).lte("day", end),
    db.from("weigh_ins").select("day,weight_lb").gte("day", start).lte("day", end),
    db.from("body_scans").select("scanned_at,weight_lb").gte("scanned_at", start).lt("scanned_at", addDays(end, 1)).not("weight_lb", "is", null),
    db.from("profiles").select("calorie_target,protein_target_g").eq("id", userId).maybeSingle<Pick<Profile, "calorie_target" | "protein_target_g">>(),
  ]);
  const weights = [
    ...(weigh.data ?? []).map((r) => ({ day: r.day as string, weight: Number(r.weight_lb) })),
    ...(scans.data ?? []).map((r) => ({ day: String(r.scanned_at).slice(0, 10), weight: Number(r.weight_lb) })),
  ];
  return weeklyReview({
    today,
    workouts: (wk.data ?? []) as never,
    nutrition: nutrition.filter((d) => d.day <= end).map((d) => ({ day: d.day, calories: d.calories, protein_g: d.protein_g })),
    checkins: (checks.data ?? []) as never,
    weights,
    targets: { calories: profile.data?.calorie_target ?? null, protein: profile.data?.protein_target_g ?? null },
  });
}

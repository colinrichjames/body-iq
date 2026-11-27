"use server";

import { requireUser } from "@/lib/auth";
import { addDays } from "@/lib/dates";
import { bodyWeightReply, findExercise, fuelReply, helpReply, lastLiftReply, nextLiftReply, parseIntent, raceReply, readinessReply, scoreReply, sessionReply, todayReply, unknownReply, type LiftSession, type Reply } from "@/lib/coach-chat";
import { loadCoach } from "@/lib/coach-data";
import { computeInsights } from "@/lib/insights";
import { classify } from "@/lib/intensity";
import { loadNutritionDays } from "@/lib/nutrition-data";
import { loadHistory } from "@/lib/progression-data";
import { suggestNext } from "@/lib/progression";
import { phaseInfo, planStartFrom } from "@/lib/race-phase";
import { computeReadiness, mergeCheckins } from "@/lib/readiness";
import { newestScanFirst } from "@/lib/scan-order";
import { targetsFor } from "@/lib/targets";
import { getToday } from "@/lib/today";
import type { BodyScan, DailyHealth, Profile, Race, RecoveryCheckin, Workout } from "@/lib/types";

/**
 * Answers one question from the signed-in user's own data. Read-only: this never writes anything. Any failure turns
 * into an honest "couldn't load that" instead of a guess.
 */
export async function askCoach(text: string, ctx: { workoutId?: string } = {}): Promise<Reply> {
  const { supabase, userId } = await requireUser();
  const question = String(text ?? "").slice(0, 300);
  try {
    const today = await getToday();
    const intent = parseIntent(question);
    switch (intent.kind) {
      case "help":
        return helpReply();
      case "unknown":
        return unknownReply();
      case "today": {
        const { data } = await supabase.from("workouts").select("*").gte("workout_date", today).lte("workout_date", addDays(today, 14)).order("workout_date").returns<Workout[]>();
        const rows = data ?? [];
        const todays = rows.filter((w) => w.workout_date === today);
        const upcoming = rows.find((w) => w.workout_date > today && w.status === "planned") ?? null;
        return todayReply(today, todays, upcoming);
      }
      case "fuel": {
        const [days, profile, wk] = await Promise.all([
          loadNutritionDays(supabase, today),
          supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>(),
          supabase.from("workouts").select("*").eq("workout_date", today).returns<Workout[]>(),
        ]);
        const d = days.find((x) => x.day === today);
        return fuelReply("today", d ? { calories: d.calories ?? 0, protein: d.protein_g ?? 0, carbs: d.carbs_g ?? 0, fat: d.fat_g ?? 0 } : null, targetsFor(today, wk.data ?? [], profile.data ?? null));
      }
      case "lift_last":
      case "lift_next": {
        const { data: names } = await supabase.from("workout_sets").select("exercise").order("created_at", { ascending: false }).limit(1500);
        const distinct = [...new Set((names ?? []).map((n) => n.exercise as string))];
        const exercise = findExercise(intent.query, distinct);
        if (!exercise) return intent.kind === "lift_last" ? lastLiftReply(null, intent.query, []) : nextLiftReply(null, intent.query, null, null);
        const { data } = await supabase
          .from("workout_sets")
          .select("weight_lb,reps,rpe,skipped,set_number,workouts!inner(workout_date,status)")
          .eq("exercise", exercise)
          .eq("workouts.status", "completed")
          .order("created_at", { ascending: false })
          .limit(120);
        type Row = { weight_lb: number | string | null; reps: number | null; rpe: number | string | null; skipped: boolean; set_number: number; workouts: { workout_date: string } | { workout_date: string }[] };
        const byDate = new Map<string, LiftSession>();
        for (const r of (data ?? []) as unknown as Row[]) {
          const date = (Array.isArray(r.workouts) ? r.workouts[0] : r.workouts).workout_date;
          const s = byDate.get(date) ?? { date, sets: [] };
          s.sets.push({ weight: r.weight_lb === null ? null : Number(r.weight_lb), reps: r.reps, rpe: r.rpe === null ? null : Number(r.rpe), skipped: r.skipped });
          byDate.set(date, s);
        }
        const sessions = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
        if (intent.kind === "lift_last") return lastLiftReply(exercise, intent.query, sessions);
        const hist = await loadHistory(supabase, today, { names: [exercise] });
        const lastReps = (sessions[0]?.sets ?? []).filter((s) => !s.skipped && s.reps).map((s) => s.reps as number).sort((a, b) => a - b);
        const reps = lastReps.length ? lastReps[Math.floor(lastReps.length / 2)] : null;
        return nextLiftReply(exercise, intent.query, reps ? suggestNext(exercise, hist[exercise] ?? [], reps) : null, reps);
      }
      case "body_weight": {
        const [{ data: scans }, profile, days] = await Promise.all([
          newestScanFirst(supabase.from("body_scans").select("*")).limit(2).returns<BodyScan[]>(),
          supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>(),
          loadNutritionDays(supabase, addDays(today, -6)),
        ]);
        const coach = await loadCoach(supabase, today, profile.data ?? null);
        const logged = days.filter((d) => (d.calories ?? 0) > 0);
        return bodyWeightReply(scans ?? [], {
          trendWeight: coach.trend?.trendWeight ?? null,
          ratePerWeek: coach.trend?.ratePerWeek ?? null,
          avgCalories: logged.length ? logged.reduce((a, d) => a + (d.calories ?? 0), 0) / logged.length : null,
          targetCalories: profile.data?.calorie_target ?? null,
          loggedDays: logged.length,
        });
      }
      case "score": {
        const [scans, wk, nutrition, profile, races, health, checks] = await Promise.all([
          newestScanFirst(supabase.from("body_scans").select("*")).limit(2).returns<BodyScan[]>(),
          supabase.from("workouts").select("*").gte("workout_date", addDays(today, -27)).lte("workout_date", addDays(today, 1)).returns<Workout[]>(),
          loadNutritionDays(supabase, addDays(today, -13)),
          supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>(),
          supabase.from("races").select("*").gte("race_date", today).order("race_date").limit(1).returns<Race[]>(),
          supabase.from("daily_health").select("*").order("day", { ascending: false }).limit(14).returns<DailyHealth[]>(),
          supabase.from("recovery_checkins").select("day,sleep_hours,soreness,energy").order("day", { ascending: false }).limit(14).returns<RecoveryCheckin[]>(),
        ]);
        const nextRace = races.data?.[0] ?? null;
        const ins = computeInsights({ today, scans: scans.data ?? [], workouts: wk.data ?? [], nutrition, health: mergeCheckins(health.data ?? [], checks.data ?? []), profile: profile.data ?? null, nextRace });
        return scoreReply(ins.score, ins.available, ins.categories);
      }
      case "readiness": {
        const [health, checks, wk] = await Promise.all([
          supabase.from("daily_health").select("*").order("day", { ascending: false }).limit(14).returns<DailyHealth[]>(),
          supabase.from("recovery_checkins").select("day,sleep_hours,soreness,energy").order("day", { ascending: false }).limit(14).returns<RecoveryCheckin[]>(),
          supabase.from("workouts").select("*").eq("workout_date", today).returns<Workout[]>(),
        ]);
        const hard = (wk.data ?? []).find((w) => w.status === "planned" && classify(w).level === "hard") ?? null;
        return readinessReply(computeReadiness(mergeCheckins(health.data ?? [], checks.data ?? [])), hard);
      }
      case "race": {
        const { data: races } = await supabase.from("races").select("*").gte("race_date", today).order("race_date").limit(1).returns<Race[]>();
        const race = races?.[0] ?? null;
        let phase: string | null = null;
        if (race) {
          const { data: plan } = await supabase.from("workouts").select("workout_date,created_at").eq("race_id", race.id).eq("generated", true).returns<{ workout_date: string; created_at: string }[]>();
          phase = phaseInfo(race.race_type, race.race_date, today, planStartFrom(plan ?? []))?.label ?? null;
        }
        return raceReply(race, today, phase);
      }
      case "session": {
        if (!ctx.workoutId) return sessionReply(null, []);
        const { data: w } = await supabase.from("workouts").select("*").eq("id", ctx.workoutId).maybeSingle<Workout>();
        if (!w) return { text: "I couldn't find that session." };
        const { data: sets } = await supabase.from("workout_sets").select("exercise,weight_lb,reps,skipped").eq("workout_id", w.id);
        return sessionReply(w, (sets ?? []).map((s) => ({ exercise: s.exercise as string, weight: s.weight_lb === null ? null : Number(s.weight_lb), reps: s.reps as number | null, skipped: s.skipped as boolean })));
      }
    }
  } catch (e) {
    console.error("askCoach failed", e);
    return { text: "I couldn't load your data just now, so I won't guess. Try again in a moment." };
  }
}

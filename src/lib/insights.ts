import { addDays, diffDays } from "./dates";
import { currentPhase, raceLabel } from "./plan";
import type { BodyScan, NutritionDay, Profile, Race, Workout } from "./types";

export type CategoryScore = {
  key: "nutrition" | "training" | "recovery" | "body" | "activity";
  label: string;
  max: number;
  /** null when there isn't enough data to score this category. */
  score: number | null;
  note: string;
};

export type Insights = {
  /** 0-100 over the categories that have data, or null when none do. */
  score: number | null;
  categories: CategoryScore[];
  available: number;
  bullets: string[];
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function computeInsights(input: {
  today: string;
  scans: BodyScan[]; // newest first
  workouts: Workout[]; // last ~28 days (and anything later)
  nutrition: NutritionDay[]; // last ~14 days
  profile: Profile | null;
  nextRace: Race | null;
}): Insights {
  const { today, scans, workouts, nutrition, profile, nextRace } = input;
  const bullets: string[] = [];
  const categories: CategoryScore[] = [];

  // ---- Nutrition (20) ------------------------------------------------------
  {
    const since = addDays(today, -6);
    const week = nutrition.filter((d) => d.day >= since && d.day <= today && (d.calories ?? 0) > 0);
    const targets = profile?.calorie_target && profile?.protein_target_g ? profile : null;
    let score: number | null = null;
    let note = "";
    if (!targets) {
      note = "Set calorie and protein targets on the Nutrition page.";
    } else if (week.length < 3) {
      note = week.length === 0 ? "No nutrition logged in the last 7 days." : `Only ${week.length} day(s) logged in the last 7.`;
    } else {
      const avgCal = avg(week.map((d) => d.calories ?? 0));
      const avgPro = avg(week.map((d) => d.protein_g ?? 0));
      const dev = Math.abs(avgCal - targets.calorie_target!) / targets.calorie_target!;
      const calScore = clamp01(1 - Math.max(0, dev - 0.05) / 0.2);
      const proScore = clamp01(1 - Math.max(0, 0.95 - avgPro / targets.protein_target_g!) / 0.35);
      const logScore = week.length / 7;
      score = Math.round(20 * (0.4 * calScore + 0.4 * proScore + 0.2 * logScore) * 10) / 10;
      note = `${week.length}/7 days logged, avg ${Math.round(avgCal)} cal and ${Math.round(avgPro)} g protein.`;
      bullets.push(
        `Nutrition: ${Math.round(avgCal)} cal/day vs ${targets.calorie_target} target, protein ${Math.round(avgPro)} g vs ${targets.protein_target_g} g.`,
      );
      const sodium = week.map((d) => d.sodium_mg ?? 0).filter((n) => n > 0);
      if (sodium.length >= 3 && avg(sodium) > 3500) {
        bullets.push(`Sodium is averaging ${Math.round(avg(sodium))} mg/day. Fine on long sweaty days, but worth watching on rest days.`);
      }
    }
    categories.push({ key: "nutrition", label: "Nutrition", max: 20, score, note });
  }

  // ---- Training (25) -------------------------------------------------------
  {
    const since = addDays(today, -13);
    const due = workouts.filter((w) => w.workout_date >= since && w.workout_date <= today);
    const done = due.filter((w) => w.status === "completed");
    const missed = due.filter((w) => w.status === "skipped" || (w.status === "planned" && w.workout_date < today));
    const scheduled = done.length + missed.length;
    let score: number | null = null;
    let note = "";
    if (scheduled < 3) {
      note = "Needs at least 3 planned sessions in the last 14 days.";
    } else {
      const completion = done.length / scheduled;
      score = Math.round(25 * completion * 10) / 10;
      note = `${done.length} of ${scheduled} planned sessions completed in the last 14 days.`;
      bullets.push(`Training: completed ${done.length} of ${scheduled} planned sessions over the last 14 days.`);
      const strengthDone = done.filter((w) => w.sport === "strength").length;
      if (done.length >= 4 && strengthDone === 0) {
        bullets.push("No strength sessions completed in the last 14 days. Muscle gain needs them even in a cardio-heavy block.");
      }
    }
    categories.push({ key: "training", label: "Training", max: 25, score, note });
  }

  // ---- Recovery (25) and Activity (10): need Garmin / Apple Health ---------
  categories.push({
    key: "recovery",
    label: "Recovery",
    max: 25,
    score: null,
    note: "Needs sleep, HRV and resting heart rate. Connect Garmin to unlock.",
  });
  categories.push({
    key: "activity",
    label: "Activity",
    max: 10,
    score: null,
    note: "Needs daily steps and active calories. Connect Garmin or Apple Health.",
  });

  // ---- Body composition (20) -----------------------------------------------
  {
    let score: number | null = null;
    let note = "";
    const [latest, previous] = scans;
    if (!latest || !previous) {
      note = "Needs at least two body scans.";
    } else {
      const dMuscle =
        latest.skeletal_muscle_lb !== null && previous.skeletal_muscle_lb !== null
          ? latest.skeletal_muscle_lb - previous.skeletal_muscle_lb
          : null;
      const dFat =
        latest.fat_mass_lb !== null && previous.fat_mass_lb !== null ? latest.fat_mass_lb - previous.fat_mass_lb : null;
      if (dMuscle === null && dFat === null) {
        note = "Scans are missing muscle and fat mass.";
      } else {
        // Recomp goal: muscle stable-to-up, fat mass stable-to-down.
        const parts: number[] = [];
        if (dMuscle !== null) parts.push(clamp01(1 - Math.max(0, -0.5 - dMuscle) / 2.5));
        if (dFat !== null) parts.push(clamp01(1 - Math.max(0, dFat - 0.5) / 3.5));
        score = Math.round(20 * avg(parts) * 10) / 10;
        const days = Math.max(1, diffDays(previous.scanned_at.slice(0, 10), latest.scanned_at.slice(0, 10)));
        const bits: string[] = [];
        if (dMuscle !== null) bits.push(`muscle ${dMuscle >= 0 ? "+" : ""}${r1(dMuscle)} lb`);
        if (dFat !== null) bits.push(`fat mass ${dFat >= 0 ? "+" : ""}${r1(dFat)} lb`);
        note = `${bits.join(", ")} over ${days} days.`;
        bullets.push(`Body composition: ${bits.join(" and ")} since your previous scan.`);
      }
    }
    if (latest && diffDays(latest.scanned_at.slice(0, 10), today) > 56) {
      bullets.push("It's been over 8 weeks since your last body scan. Time to rescan.");
    }
    categories.push({ key: "body", label: "Body composition", max: 20, score, note });
  }

  // ---- Race context --------------------------------------------------------
  if (nextRace) {
    const days = diffDays(today, nextRace.race_date);
    if (days >= 0) {
      const phase = currentPhase(nextRace.race_type, nextRace.race_date, today);
      bullets.push(
        `${nextRace.name} (${raceLabel(nextRace.race_type)}) is ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}${phase ? `, you're in the ${phase} phase` : ""}.`,
      );
    }
  }

  const scored = categories.filter((c) => c.score !== null);
  const earned = scored.reduce((a, c) => a + (c.score ?? 0), 0);
  const possible = scored.reduce((a, c) => a + c.max, 0);
  const missing = categories.filter((c) => c.score === null && (c.key === "recovery" || c.key === "activity"));
  if (missing.length) bullets.push("Connect Garmin to add recovery and activity to your score.");

  return {
    score: possible > 0 ? Math.round((earned / possible) * 100) : null,
    categories,
    available: scored.length,
    bullets,
  };
}

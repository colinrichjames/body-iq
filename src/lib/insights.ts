import { addDays, diffDays } from "./dates";
import { currentPhase, raceLabel } from "./plan";
import { targetsFor } from "./targets";
import type { BodyScan, DailyHealth, NutritionDay, Profile, Race, Workout } from "./types";

export type CategoryScore = {
  key: "nutrition" | "training" | "recovery" | "body" | "activity";
  label: string;
  max: number;
  /** null when there isn't enough data to score this category. */
  score: number | null;
  note: string;
  /** The exact input still missing when score is null; otherwise null. */
  missing: string | null;
  /** One line on how this category is scored. */
  rule: string;
};

export const SCORE_NAME = "Body IQ score";

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
  health?: DailyHealth[]; // newest first, last ~8 days
  profile: Profile | null;
  nextRace: Race | null;
}): Insights {
  const { today, scans, workouts, nutrition, profile, nextRace } = input;
  const health = input.health ?? [];
  const bullets: string[] = [];
  const categories: CategoryScore[] = [];

  // ---- Nutrition (20) ------------------------------------------------------
  {
    const since = addDays(today, -6);
    const week = nutrition.filter((d) => d.day >= since && d.day <= today && (d.calories ?? 0) > 0);
    const targets = profile?.calorie_target && profile?.protein_target_g ? profile : null;
    const dayTargets = week.map((d) => targetsFor(d.day, workouts, profile));
    const tCal = avg(dayTargets.map((t) => t.calories ?? targets?.calorie_target ?? 0));
    const tPro = avg(dayTargets.map((t) => t.protein ?? targets?.protein_target_g ?? 0));
    let score: number | null = null;
    let note = "";
    let missing: string | null = null;
    if (!targets) {
      missing = "Calorie and protein targets (set them on the Nutrition page).";
      note = missing;
    } else if (week.length < 1) {
      missing = "At least 1 day of food logged in the last 7 days.";
      note = "No nutrition logged in the last 7 days.";
    } else {
      const avgCal = avg(week.map((d) => d.calories ?? 0));
      const avgPro = avg(week.map((d) => d.protein_g ?? 0));
      const dev = Math.abs(avgCal - tCal) / tCal;
      const calScore = clamp01(1 - Math.max(0, dev - 0.05) / 0.2);
      const proScore = clamp01(1 - Math.max(0, 0.95 - avgPro / tPro) / 0.35);
      const logScore = week.length / 7;
      score = Math.round(20 * (0.4 * calScore + 0.4 * proScore + 0.2 * logScore) * 10) / 10;
      note = `${week.length}/7 days logged, avg ${Math.round(avgCal)} cal and ${Math.round(avgPro)} g protein.${week.length < 3 ? " More logged days make this more reliable." : ""}`;
      bullets.push(
        `Nutrition: ${Math.round(avgCal)} cal/day vs ${Math.round(tCal)} target, protein ${Math.round(avgPro)} g vs ${Math.round(tPro)} g.`,
      );
      const sodium = week.map((d) => d.sodium_mg ?? 0).filter((n) => n > 0);
      if (sodium.length >= 3 && avg(sodium) > 3500) {
        bullets.push(`Sodium is averaging ${Math.round(avg(sodium))} mg/day. Fine on long sweaty days, but worth watching on rest days.`);
      }
    }
    categories.push({
      key: "nutrition",
      label: "Nutrition",
      max: 20,
      score,
      note,
      missing,
      rule: "Last 7 days vs your targets: calories 40%, protein 40%, days logged 20%. Needs targets and 1+ logged day.",
    });
  }

  // ---- Training (25) -------------------------------------------------------
  {
    const since = addDays(today, -13);
    const inWindow = workouts.filter((w) => w.workout_date >= since && w.workout_date <= today);
    const done = inWindow.filter((w) => w.status === "completed");
    // A session counts against you only once its day has passed (or you skipped it).
    const missed = inWindow.filter((w) => w.status === "skipped" || ((w.status === "planned" || w.status === "in_progress") && w.workout_date < today));
    const pendingToday = inWindow.filter((w) => (w.status === "planned" || w.status === "in_progress") && w.workout_date === today).length;
    const upcoming = workouts.filter((w) => w.workout_date > today && w.status === "planned").length;
    const due = done.length + missed.length;
    let score: number | null = null;
    let note = "";
    let missing: string | null = null;
    if (due < 3) {
      const need = 3 - due;
      missing = `${need} more session${need === 1 ? "" : "s"} to finish or pass their date (3 needed).`;
      note = `${due} session${due === 1 ? "" : "s"} counted so far in the last 14 days (${done.length} completed, ${missed.length} missed or skipped). Sessions count once completed, skipped, or their day has passed${upcoming + pendingToday > 0 ? `; ${upcoming + pendingToday} still upcoming don't count yet` : ""}.`;
    } else {
      const completion = done.length / due;
      score = Math.round(25 * completion * 10) / 10;
      note = `${done.length} of ${due} sessions completed in the last 14 days.`;
      bullets.push(`Training: completed ${done.length} of ${due} sessions over the last 14 days.`);
      const strengthDone = done.filter((w) => w.sport === "strength").length;
      if (done.length >= 4 && strengthDone === 0) {
        bullets.push("No strength sessions completed in the last 14 days. Muscle gain needs them even in a cardio-heavy block.");
      }
    }
    categories.push({
      key: "training",
      label: "Training",
      max: 25,
      score,
      note,
      missing,
      rule: "Completed sessions ÷ sessions that are due (completed + skipped + planned days already past), last 14 days. Needs 3 due.",
    });
  }

  // ---- Recovery (25) and Activity (10): from Garmin daily data -------------
  {
    const since = addDays(today, -6);
    const week = health.filter((h) => h.day >= since && h.day <= today);
    const older = health.filter((h) => h.day < since || h.day > today);
    const parts: number[] = [];
    const bits: string[] = [];
    const sleeps = week.map((h) => h.sleep_seconds).filter((v): v is number => v !== null && v > 0);
    if (sleeps.length) {
      const h = avg(sleeps) / 3600;
      parts.push(clamp01(h / 7.5));
      bits.push(`sleep ${r1(h)} h`);
    }
    const batt = week.map((h) => h.body_battery_max).filter((v): v is number => v !== null);
    if (batt.length) {
      parts.push(clamp01(avg(batt) / 80));
      bits.push(`Body Battery peak ${Math.round(avg(batt))}`);
    }
    const hrvs = week.map((h) => h.hrv_ms).filter((v): v is number => v !== null);
    const hrvBase = older.map((h) => h.hrv_ms).filter((v): v is number => v !== null);
    if (hrvs.length && hrvBase.length >= 3) {
      parts.push(clamp01(avg(hrvs) / avg(hrvBase) / 0.95));
      bits.push(`HRV ${Math.round(avg(hrvs))} ms`);
    }
    const rule = "Last 7 days from Garmin: sleep vs 7.5 h, Body Battery peak vs 80, HRV vs your earlier baseline (needs 3 earlier days). Needs 1+ day with sleep or Body Battery.";
    if (parts.length) {
      categories.push({ key: "recovery", label: "Recovery", max: 25, score: Math.round(25 * avg(parts) * 10) / 10, note: `Avg ${bits.join(", ")} over ${week.length} day${week.length === 1 ? "" : "s"}.`, missing: null, rule });
    } else {
      categories.push({
        key: "recovery",
        label: "Recovery",
        max: 25,
        score: null,
        note: "No sleep or Body Battery data in the last 7 days.",
        missing: health.length ? "Sleep or Body Battery from the last 7 days (sync Garmin)." : "Garmin sync with sleep or Body Battery (connect Garmin).",
        rule,
      });
    }

    const steps = week.map((h) => h.steps).filter((v): v is number => v !== null && v > 0);
    const arule = "Average daily steps over the last 7 days vs 8,000. Needs 1+ day of steps.";
    if (steps.length) {
      const a = avg(steps);
      categories.push({ key: "activity", label: "Activity", max: 10, score: Math.round(10 * clamp01(a / 8000) * 10) / 10, note: `Avg ${Math.round(a).toLocaleString("en-US")} steps over ${steps.length} day${steps.length === 1 ? "" : "s"}.`, missing: null, rule: arule });
    } else {
      categories.push({
        key: "activity",
        label: "Activity",
        max: 10,
        score: null,
        note: "No step data in the last 7 days.",
        missing: health.length ? "Daily steps from the last 7 days (sync Garmin)." : "Garmin sync with daily steps (connect Garmin).",
        rule: arule,
      });
    }
  }

  // ---- Body composition (20) -----------------------------------------------
  {
    let score: number | null = null;
    let note = "";
    let missing: string | null = null;
    const [latest, previous] = scans;
    if (!latest || !previous) {
      missing = latest ? "A second body scan (you have 1)." : "Two body scans (you have 0).";
      note = missing;
    } else {
      const dMuscle =
        latest.skeletal_muscle_lb !== null && previous.skeletal_muscle_lb !== null
          ? latest.skeletal_muscle_lb - previous.skeletal_muscle_lb
          : null;
      const dFat =
        latest.fat_mass_lb !== null && previous.fat_mass_lb !== null ? latest.fat_mass_lb - previous.fat_mass_lb : null;
      if (dMuscle === null && dFat === null) {
        missing = "Muscle or fat mass on both of your latest two scans.";
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
    categories.push({
      key: "body",
      label: "Body composition",
      max: 20,
      score,
      note,
      missing,
      rule: "Change between your latest two scans: skeletal muscle stable-to-up, fat mass stable-to-down. Needs 2 scans.",
    });
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
  const noGarmin = categories.filter((c) => c.score === null && (c.key === "recovery" || c.key === "activity"));
  if (noGarmin.length) bullets.push("Sync Garmin to add recovery and activity to your score.");

  return {
    score: possible > 0 ? Math.round((earned / possible) * 100) : null,
    categories,
    available: scored.length,
    bullets,
  };
}

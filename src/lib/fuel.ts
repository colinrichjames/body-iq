import { diffDays } from "./dates";
import { classify } from "./intensity";
import type { Workout } from "./types";

export type FuelDay = {
  label: string;
  carbsPerKg: [number, number];
  proteinPerKg: [number, number];
  carbsG: [number, number] | null;
  proteinG: [number, number] | null;
  note: string;
};

const PROTEIN: [number, number] = [1.6, 2.0];

/**
 * Daily performance-fuelling ranges by training demand (g/kg/day), from the research brief:
 * rest 3-4, easy aerobic 5-6, long or quality 7-9, long hard day in a full-distance block 8-10, pre-race carb load 10-12.
 * These are performance ranges, not fat-loss targets.
 */
export function fuelForDay(day: string, workouts: Workout[], weightKg: number | null, raceDate: string | null, raceType: string | null): FuelDay {
  const today = workouts.filter((w) => w.workout_date === day && w.status !== "skipped");
  const classes = today.map(classify);
  const toRace = raceDate ? diffDays(day, raceDate) : null;

  let label: string;
  let carbs: [number, number];
  let note = "";
  if (toRace === 1 || toRace === 0) {
    label = toRace === 0 ? "Race day" : "Carb load";
    carbs = toRace === 0 ? [1.5, 3] : [10, 12];
    note =
      toRace === 0
        ? "Race morning: 1.5-3 g/kg of carbs, 3-4 hours before the start, then fuel during the race."
        : "Pre-race carb load over the 24-36 hours before the start. Keep fibre and fat low.";
  } else if (classes.length === 0 || classes.every((c) => c.level === "easy" && !c.long) && today.every((w) => (w.planned_duration_min ?? 0) < 30)) {
    label = classes.length ? "Easy day" : "Rest day";
    carbs = classes.length ? [5, 6] : [3, 4];
  } else if (classes.some((c) => c.long && c.level === "hard") && raceType?.startsWith("triathlon_140")) {
    label = "Long hard day";
    carbs = [8, 10];
  } else if (classes.some((c) => c.level === "hard" || c.long)) {
    label = "Hard or long day";
    carbs = [7, 9];
  } else {
    label = "Moderate day";
    carbs = [5, 6];
  }

  return {
    label,
    carbsPerKg: carbs,
    proteinPerKg: PROTEIN,
    carbsG: weightKg ? [Math.round(carbs[0] * weightKg), Math.round(carbs[1] * weightKg)] : null,
    proteinG: weightKg ? [Math.round(PROTEIN[0] * weightKg), Math.round(PROTEIN[1] * weightKg)] : null,
    note,
  };
}

export type SessionFuel = { carbsPerHour: [number, number]; fluidMlPerHour: [number, number]; sodiumMgPerHour: [number, number]; text: string } | null;

/** In-session fuelling for sessions of 75 minutes or more. */
export function sessionFuel(w: Pick<Workout, "sport" | "title" | "planned_duration_min">): SessionFuel {
  const minutes = w.planned_duration_min ?? 0;
  if (minutes < 75) return null;
  const bike = w.sport === "bike";
  const carbs: [number, number] = bike ? [60, 90] : [45, 75];
  return {
    carbsPerHour: carbs,
    fluidMlPerHour: [400, 800],
    sodiumMgPerHour: [300, 600],
    text: `${carbs[0]}-${carbs[1]} g carbs per hour, 400-800 ml fluid and 300-600 mg sodium per hour (scale with sweat and heat). Rehearse your race products in sessions like this.`,
  };
}

// ---------------------------------------------------------------------------
// Tracking what you actually took in
// ---------------------------------------------------------------------------
const FUEL_FROM_MIN = 75;

type FuelWorkout = Pick<Workout, "sport" | "planned_duration_min" | "actual_duration_min" | "fuel_carbs_g" | "fluid_ml" | "sodium_mg">;

export type FuelRow = { label: string; unit: string; actual: number | null; perHour: number | null; range: [number, number]; status: "low" | "ok" | "high" | "none" };
export type FuelCheck = { hours: number; rows: FuelRow[]; summary: string };

/** Total in-session targets for the planned length, e.g. a 2 hour run: 90-150 g carbs. */
export function sessionTotals(minutes: number, sport: string): { carbs: [number, number]; fluid: [number, number]; sodium: [number, number] } | null {
  if (minutes < FUEL_FROM_MIN) return null;
  const h = minutes / 60;
  const per = sport === "bike" ? [60, 90] : [45, 75];
  const r = (n: number, step: number) => Math.round(n / step) * step;
  return {
    carbs: [r(per[0] * h, 5), r(per[1] * h, 5)],
    fluid: [r(400 * h, 50), r(800 * h, 50)],
    sodium: [r(300 * h, 50), r(600 * h, 50)],
  };
}

/**
 * Compares what you logged with the per-hour ranges, for sessions of 75 minutes or more. Under the range on carbs is
 * the one worth flagging: that's the common long-session mistake. Returns null if nothing was logged or it was short.
 */
export function fuelCheck(w: FuelWorkout): FuelCheck | null {
  const minutes = w.actual_duration_min ?? w.planned_duration_min ?? 0;
  if (minutes < FUEL_FROM_MIN) return null;
  if (w.fuel_carbs_g === null && w.fluid_ml === null && w.sodium_mg === null) return null;
  const hours = minutes / 60;
  const plan = sessionFuel({ sport: w.sport, title: "", planned_duration_min: minutes });
  if (!plan) return null;
  const mk = (label: string, unit: string, actual: number | null, range: [number, number]): FuelRow => {
    if (actual === null) return { label, unit, actual, perHour: null, range, status: "none" };
    const perHour = Math.round(Number(actual) / hours);
    return { label, unit, actual: Number(actual), perHour, range, status: perHour < range[0] ? "low" : perHour > range[1] ? "high" : "ok" };
  };
  const rows = [mk("Carbs", "g", w.fuel_carbs_g, plan.carbsPerHour), mk("Fluid", "ml", w.fluid_ml, plan.fluidMlPerHour), mk("Sodium", "mg", w.sodium_mg, plan.sodiumMgPerHour)];
  const carbs = rows[0];
  const summary =
    carbs.status === "low"
      ? `Carbs were ${carbs.perHour} g/h, under the ${carbs.range[0]}-${carbs.range[1]} g/h range. Practise taking more earlier; the gut trains.`
      : carbs.status === "high"
        ? `Carbs were ${carbs.perHour} g/h, above the range. Fine if your stomach was happy.`
        : carbs.status === "ok"
          ? `Carbs were on target at ${carbs.perHour} g/h.`
          : "Log your carbs too to see how the session went.";
  return { hours, rows, summary };
}

/**
 * Daily water target in ml: about 35 ml per kg of body weight (2.5 L if weight is unknown), plus about 500 ml for
 * every hour of training that day. Rounded to the nearest 50.
 */
export function hydrationTarget(weightKg: number | null, trainingMinutes: number): number {
  const base = weightKg ? 35 * weightKg : 2500;
  return Math.round((base + (trainingMinutes / 60) * 500) / 50) * 50;
}

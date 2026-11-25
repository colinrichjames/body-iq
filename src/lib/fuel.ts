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

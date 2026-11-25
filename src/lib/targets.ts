import type { Profile, Workout } from "./types";

export type DayTargets = { calories: number | null; protein: number | null; carbs: number | null; fat: number | null };

/** A training day is any day with a planned or completed session (not skipped, not mobility-only). */
export function isTrainingDay(day: string, workouts: Workout[]): boolean {
  return workouts.some((w) => w.workout_date === day && w.status !== "skipped" && w.sport !== "mobility");
}

export function targetsFor(day: string, workouts: Workout[], profile: Profile | null): DayTargets {
  const train: DayTargets = {
    calories: profile?.calorie_target ?? null,
    protein: profile?.protein_target_g ?? null,
    carbs: profile?.carbs_target_g ?? null,
    fat: profile?.fat_target_g ?? null,
  };
  if (isTrainingDay(day, workouts)) return train;
  return {
    calories: profile?.rest_calorie_target ?? train.calories,
    protein: profile?.rest_protein_g ?? train.protein,
    carbs: profile?.rest_carbs_g ?? train.carbs,
    fat: profile?.rest_fat_g ?? train.fat,
  };
}

/** Calories implied by macros (protein and carbs 4 per gram, fat 9). */
export const macroCalories = (protein: number | null, carbs: number | null, fat: number | null) =>
  protein === null || carbs === null || fat === null ? null : Math.round(protein * 4 + carbs * 4 + fat * 9);

/**
 * Do the macro targets add up to the calorie target? Returns a plain sentence when they are more than 8% apart
 * (a few percent is normal rounding), otherwise null.
 */
export function macroMismatch(t: DayTargets): string | null {
  const implied = macroCalories(t.protein, t.carbs, t.fat);
  if (implied === null || !t.calories) return null;
  const gap = implied - t.calories;
  if (Math.abs(gap) / t.calories <= 0.08) return null;
  return `Your protein, carbs and fat add up to ${implied.toLocaleString("en-US")} calories, ${Math.abs(gap).toLocaleString("en-US")} ${gap > 0 ? "more" : "fewer"} than the ${t.calories.toLocaleString("en-US")} target.`;
}

/** How many left or over, in words: "320 left" or "150 over". */
export const remainingText = (target: number, eaten: number, unit = "") => {
  const diff = Math.round(target - eaten);
  return diff >= 0 ? `${diff}${unit} left` : `${-diff}${unit} over`;
};

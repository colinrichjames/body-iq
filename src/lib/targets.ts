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

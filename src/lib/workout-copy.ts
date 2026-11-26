import type { Workout } from "./types";

/**
 * The row for a copy of a workout on another day: everything that describes the plan (sport, title, details, planned
 * duration and distance with its unit, structure and exercises). Results from doing the session (status, actuals, heart
 * rate, RPE, notes, fuel, progress, sets) stay behind: the copy is a fresh planned session. It is the user's own, so it
 * is not tied to a race plan and plan re-alignment never rewrites it.
 */
export function copyRow(w: Workout, userId: string, date: string) {
  return {
    user_id: userId,
    workout_date: date,
    sport: w.sport,
    title: w.title,
    description: w.description,
    planned_duration_min: w.planned_duration_min,
    planned_distance_km: w.planned_distance_km,
    distance_unit: w.distance_unit,
    structure: w.structure,
    generated: false,
    status: "planned" as const,
  };
}

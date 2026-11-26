import { fmtDist, fmtPace, type DistUnit } from "./distance";
import type { Workout } from "./types";

/**
 * The facts shown under the date on a workout page: duration, distance and (for a finished run, bike or row) pace.
 * A completed workout shows what you actually did and falls back to the plan only for what wasn't recorded.
 */
export function headerFacts(w: Pick<Workout, "status" | "sport" | "planned_duration_min" | "planned_distance_km" | "actual_duration_min" | "actual_distance_km">, unit: DistUnit): string[] {
  const done = w.status === "completed";
  const minutes = done ? (w.actual_duration_min ?? w.planned_duration_min) : w.planned_duration_min;
  const km = done ? (w.actual_distance_km ?? w.planned_distance_km) : w.planned_distance_km;
  const out: string[] = [];
  if (minutes) out.push(`${minutes} min`);
  if (km) out.push(fmtDist(Number(km), unit));
  if (done && minutes && km && w.sport !== "swim") out.push(fmtPace(minutes, Number(km), unit));
  return out;
}

/** Skip, Start timer and Mark done only make sense for a session that hasn't been finished or skipped. */
export const canStartOrFinish = (status: Workout["status"]) => status === "planned" || status === "in_progress";

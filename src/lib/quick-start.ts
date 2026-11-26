import type { Exercise } from "./types";

export const STAPLES = [
  "Back Squat",
  "Bench Press",
  "Deadlift",
  "Overhead Press",
  "Barbell Row",
  "Pull-ups",
  "Push-ups",
  "Romanian Deadlift",
  "Lunges",
  "Leg Press",
  "Lat Pulldown",
  "Dumbbell Curl",
  "Triceps Pushdown",
  "Plank",
  "Hip Thrust",
  "Goblet Squat",
];

/** "Morning Workout", "Afternoon Workout" or "Evening Workout" for a local hour (0-23). */
export function quickTitle(hour: number): string {
  const h = Number.isFinite(hour) ? hour : 12;
  return `${h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening"} Workout`;
}

/** Distinct exercise names, most recently logged first, capped. Input is newest-first. */
export function recentNames(rows: { exercise: string }[], max = 12): string[] {
  const seen: string[] = [];
  for (const r of rows) {
    const n = r.exercise.trim();
    if (n && !seen.some((s) => s.toLowerCase() === n.toLowerCase())) seen.push(n);
    if (seen.length >= max) break;
  }
  return seen;
}

/** Picked names to a starter structure: 3 sets of 10 unless the user changed it. Duplicates (any case) collapse. */
export function pickedToExercises(picked: { name: string; sets?: number; reps?: number }[]): Exercise[] {
  const out: Exercise[] = [];
  for (const p of picked) {
    const name = p.name.trim();
    if (!name || out.some((e) => e.name.toLowerCase() === name.toLowerCase())) continue;
    out.push({ name, sets: p.sets && p.sets > 0 ? p.sets : 3, reps: p.reps && p.reps > 0 ? p.reps : 10 });
  }
  return out;
}

import { RACE_TYPES, type TrainingPrefs } from "./plan";
import type { RaceType } from "./types";

/** Weekday labels in display order (Sunday first, matching the calendar) with the plan's day number (Monday = 0). */
export const PREF_DAYS: { dow: number; short: string; long: string }[] = [
  { dow: 6, short: "Sun", long: "Sunday" },
  { dow: 0, short: "Mon", long: "Monday" },
  { dow: 1, short: "Tue", long: "Tuesday" },
  { dow: 2, short: "Wed", long: "Wednesday" },
  { dow: 3, short: "Thu", long: "Thursday" },
  { dow: 4, short: "Fri", long: "Friday" },
  { dow: 5, short: "Sat", long: "Saturday" },
];

/** Checks stored or submitted preferences. Needs 2-7 distinct days; the long day must be one of them. */
export function sanitizePrefs(input: unknown): TrainingPrefs | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o.days)) return null;
  const days = [...new Set(o.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (days.length < 2) return null;
  const long = Number(o.longDay);
  return { days, longDay: days.includes(long) ? long : days[days.length - 1] };
}

/** Preferences from the form: day checkboxes named "day" and a "long_day" select. */
export function prefsFromForm(formData: FormData): TrainingPrefs | null {
  return sanitizePrefs({ days: formData.getAll("day"), longDay: formData.get("long_day") });
}

/** What the plan does with no saved preferences: Monday to Saturday, long session on Saturday. */
export const DEFAULT_PREFS: TrainingPrefs = { days: [0, 1, 2, 3, 4, 5], longDay: 5 };

/** The week the plan builds without preferences: triathlon also uses Sunday for the long run. */
export function defaultPrefs(raceType: RaceType): TrainingPrefs {
  return RACE_TYPES.find((r) => r.value === raceType)?.family === "tri" ? { days: [0, 1, 2, 3, 4, 5, 6], longDay: 5 } : DEFAULT_PREFS;
}

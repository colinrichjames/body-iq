import type { Sport } from "./types";

export type Act = {
  id: string;
  sport: string | null;
  title: string | null;
  started_at: string;
  duration_sec: number | null;
  distance_m: number | string | null;
  avg_hr: number | null;
  avg_power: number | null;
};
export type WorkoutLite = { id: string; workout_date: string; sport: Sport; status: string; activity_id: string | null };

/** Garmin's activity type key to one of Body IQ's sports. Walks, hikes and anything unknown land in "other". */
export function sportFor(typeKey: string | null): Sport {
  const k = (typeKey ?? "").toLowerCase();
  if (/run|treadmill/.test(k)) return "run";
  if (/cycl|bik|spin/.test(k)) return "bike";
  if (/swim/.test(k)) return "swim";
  if (/strength|weight|gym/.test(k)) return "strength";
  if (/yoga|pilates|stretch|mobility/.test(k)) return "mobility";
  return "other";
}

const WORDS: Record<string, string> = { walking: "Walk", hiking: "Hike", running: "Run", cycling: "Ride", lap_swimming: "Swim", open_water_swimming: "Swim", strength_training: "Strength" };

/** A readable title: the Garmin activity name when it has one, otherwise from the type key. */
export function titleFor(a: Pick<Act, "title" | "sport">): string {
  const t = (a.title ?? "").trim();
  if (t) return t.slice(0, 160);
  const k = (a.sport ?? "").toLowerCase();
  if (WORDS[k]) return WORDS[k];
  const words = k.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Workout";
}

export type ImportPlan = { attach: { workoutId: string; activity: Act }[]; create: Act[] };

/**
 * Decides what to do with synced activities that aren't on a workout yet. One planned session on the same day with
 * the same sport gets the activity attached; anything else becomes a new completed workout. Activities under two
 * minutes are ignored. `dayOf` turns a start time into the user's local date.
 */
export function planImport(acts: Act[], workouts: WorkoutLite[], dayOf: (iso: string) => string): ImportPlan {
  const linked = new Set(workouts.map((w) => w.activity_id).filter(Boolean));
  const claimed = new Set<string>();
  const plan: ImportPlan = { attach: [], create: [] };
  const todo = acts.filter((a) => !linked.has(a.id) && (a.duration_sec ?? 0) >= 120).sort((a, b) => (a.started_at < b.started_at ? -1 : 1));
  for (const a of todo) {
    const day = dayOf(a.started_at);
    const sport = sportFor(a.sport);
    const matches = sport === "other" ? [] : workouts.filter((w) => w.status === "planned" && w.workout_date === day && w.sport === sport && !w.activity_id && !claimed.has(w.id));
    if (matches.length === 1) {
      claimed.add(matches[0].id);
      plan.attach.push({ workoutId: matches[0].id, activity: a });
    } else {
      plan.create.push(a);
    }
  }
  return plan;
}

/** Workout columns filled from a Garmin activity. */
export function activityFields(a: Act) {
  const dist = a.distance_m !== null && a.distance_m !== undefined ? Number(a.distance_m) : 0;
  return {
    completed_at: a.started_at,
    activity_id: a.id,
    actual_duration_min: a.duration_sec ? Math.round(a.duration_sec / 60) : null,
    actual_distance_km: dist > 0 ? Math.round(dist / 10) / 100 : null,
    avg_hr: a.avg_hr,
    avg_power: a.avg_power,
  };
}

/** "Today 12:10 PM", "Yesterday 9:02 AM" or "Nov 24, 9:02 AM" in the given timezone. */
export function formatSynced(iso: string, tz: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
  if (day(d) === day(now)) return `Today ${time}`;
  if (day(d) === day(new Date(now.getTime() - 86_400_000))) return `Yesterday ${time}`;
  return `${new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(d)}, ${time}`;
}

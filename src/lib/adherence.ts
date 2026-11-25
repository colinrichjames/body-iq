import { addDays, startOfWeek } from "./dates";
import { classify } from "./intensity";
import type { Workout } from "./types";

type W = Pick<Workout, "id" | "workout_date" | "status" | "title" | "sport" | "race_id" | "planned_duration_min">;

/** A session is "due" once it is done, skipped, or its day has passed. Today's unfinished sessions don't count yet. */
const isDone = (w: W) => w.status === "completed";
const isMissed = (w: W, today: string) => w.status === "skipped" || ((w.status === "planned" || w.status === "in_progress") && w.workout_date < today);
const isDue = (w: W, today: string) => isDone(w) || isMissed(w, today);

export type Adherence = { done: number; due: number; pct: number | null };

/** Share of due sessions you completed in the last `days` days (today included). */
export function adherence(workouts: W[], today: string, days: number): Adherence {
  const since = addDays(today, -(days - 1));
  const due = workouts.filter((w) => w.workout_date >= since && w.workout_date <= today && isDue(w, today));
  const done = due.filter(isDone).length;
  return { done, due: due.length, pct: due.length ? Math.round((done / due.length) * 100) : null };
}

export const WEEK_GOAL = 0.8;

export type Streaks = {
  /** Most recent due sessions in a row that were completed. */
  sessions: number;
  /** Consecutive weeks (ending this week or last) where at least 80% of due sessions were completed. */
  weeks: number;
  bestWeeks: number;
};

export function streaks(workouts: W[], today: string): Streaks {
  const due = workouts.filter((w) => isDue(w, today) && w.workout_date <= today).sort((a, b) => (a.workout_date < b.workout_date ? 1 : a.workout_date > b.workout_date ? -1 : 0));
  let sessions = 0;
  for (const w of due) {
    if (!isDone(w)) break;
    sessions++;
  }

  const byWeek = new Map<string, { done: number; due: number }>();
  for (const w of due) {
    const k = startOfWeek(w.workout_date);
    const t = byWeek.get(k) ?? { done: 0, due: 0 };
    t.due++;
    if (isDone(w)) t.done++;
    byWeek.set(k, t);
  }
  // Walk back week by week. A week with nothing due is neutral (no plan, rest week): it neither adds nor breaks.
  const thisWeek = startOfWeek(today);
  const oldest = [...byWeek.keys()].sort()[0];
  let weeks = 0;
  let best = 0;
  let run = 0;
  let current: number | null = null;
  if (oldest) {
    for (let k = thisWeek; k >= oldest; k = addDays(k, -7)) {
      const t = byWeek.get(k);
      if (!t) continue;
      const ok = t.done / t.due >= WEEK_GOAL;
      if (ok) {
        run++;
        best = Math.max(best, run);
      } else {
        // The week in progress doesn't break the streak until it ends: only count it if it is already good.
        if (k === thisWeek && current === null) {
          continue;
        }
        if (current === null) current = run;
        run = 0;
      }
    }
    if (current === null) current = run;
    weeks = current;
  }
  return { sessions, weeks, bestWeeks: Math.max(best, weeks) };
}

export type MissedMove = { id: string; title: string; from: string; to: string };
export type MissedPlan = { missed: W[]; moves: MissedMove[]; skips: W[] };

const MAKEUP_WINDOW_DAYS = 4; // only recent misses are worth making up
const MAX_MAKEUPS = 2; // never cram: at most two sessions are moved forward
const LOOKAHEAD_DAYS = 5;

/**
 * What to do about planned sessions whose day passed. Recent, important ones (hard/long) get moved to the next free
 * day, at most two, and never next to another hard day. Everything else is skipped, not crammed in.
 * `raceDates` stops a make-up from landing after the race it belongs to.
 */
export function planMissed(workouts: W[], today: string, raceDates: Record<string, string> = {}): MissedPlan {
  const missed = workouts
    .filter((w) => (w.status === "planned" || w.status === "in_progress") && w.workout_date < today && w.workout_date >= addDays(today, -13))
    .sort((a, b) => (a.workout_date < b.workout_date ? -1 : 1));

  const active = workouts.filter((w) => w.status !== "skipped" && !missed.includes(w));
  const dayItems = (d: string) => active.filter((w) => w.workout_date === d);
  const isHardDay = (d: string) => dayItems(d).some((w) => classify(w).level === "hard");

  const rank = (w: W) => {
    const c = classify(w);
    return (c.long ? 2 : 0) + (c.level === "hard" ? 1 : 0);
  };
  const candidates = missed
    .filter((w) => w.workout_date >= addDays(today, -MAKEUP_WINDOW_DAYS) && !classify(w).race)
    .sort((a, b) => rank(b) - rank(a) || (a.workout_date < b.workout_date ? 1 : -1));

  const moves: MissedMove[] = [];
  const taken = new Set<string>();
  for (const w of candidates) {
    if (moves.length >= MAX_MAKEUPS) break;
    const hard = classify(w).level === "hard";
    const limit = w.race_id ? raceDates[w.race_id] : undefined;
    for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
      const d = addDays(today, i);
      if (limit && d >= limit) break;
      if (dayItems(d).length > 0 || taken.has(d)) continue;
      if (hard && (isHardDay(addDays(d, -1)) || isHardDay(addDays(d, 1)) || taken.has(addDays(d, -1)) || taken.has(addDays(d, 1)))) continue;
      moves.push({ id: w.id, title: w.title, from: w.workout_date, to: d });
      taken.add(d);
      break;
    }
  }
  const moved = new Set(moves.map((m) => m.id));
  return { missed, moves, skips: missed.filter((w) => !moved.has(w.id)) };
}

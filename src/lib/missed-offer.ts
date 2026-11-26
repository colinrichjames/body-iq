import { addDays } from "./dates";
import { classify } from "./intensity";
import type { Workout } from "./types";

export type AW = Pick<Workout, "id" | "workout_date" | "status" | "title" | "sport" | "race_id" | "planned_duration_min" | "generated"> & { adaptation_handled_at?: string | null };

export type MissedOffer = {
  /** The skipped or missed session this offer is about. */
  id: string;
  title: string;
  date: string;
  kind: "move" | "trim" | "drop";
  /** For a move: the new day. */
  to?: string;
  /** For a trim: the planned sessions that get shorter, and by how much. */
  trimIds?: string[];
  trimPct?: number;
  headline: string;
  detail: string;
};

export const TRIM_PCT = 10;
const WINDOW_DAYS = 7; // only recent skips are worth adapting around
const LOOKAHEAD_DAYS = 5;


/**
 * One offer for the most recent skipped plan session (sessions whose day simply passed are handled by the "You missed" card), never a silent rewrite:
 * - an important session (hard or long) moves to the next free day if there is one, not next to another hard day;
 * - otherwise next week's planned sessions get 10% shorter, so the lost work isn't crammed in;
 * - an easy session is simply dropped. Nothing is moved or trimmed.
 * Sessions already accepted or dismissed (adaptation_handled_at) are not offered again. Deterministic, no outside services.
 */
export function adaptationOffer(workouts: AW[], today: string, raceDates: Record<string, string> = {}): MissedOffer | null {
  const since = addDays(today, -WINDOW_DAYS);
  const rank = (w: AW) => {
    const c = classify(w);
    return (c.long ? 2 : 0) + (c.level === "hard" ? 1 : 0);
  };
  const candidates = workouts
    .filter((w) => w.generated && !w.adaptation_handled_at && w.workout_date >= since && w.workout_date <= today && w.status === "skipped" && !classify(w).race && w.sport !== "mobility")
    .sort((a, b) => (a.workout_date === b.workout_date ? rank(b) - rank(a) : a.workout_date < b.workout_date ? 1 : -1));
  const w = candidates[0];
  if (!w) return null;

  const base = { id: w.id, title: w.title, date: w.workout_date };
  const c = classify(w);
  const important = c.level === "hard" || c.long;
  if (!important) {
    return { ...base, kind: "drop", headline: `You skipped ${w.title}.`, detail: "It was an easy session, so nothing needs making up. Drop it and carry on with the plan." };
  }

  const limit = w.race_id ? raceDates[w.race_id] : undefined;
  const active = workouts.filter((x) => x.id !== w.id && x.status !== "skipped");
  const dayItems = (d: string) => active.filter((x) => x.workout_date === d);
  const isHardDay = (d: string) => dayItems(d).some((x) => classify(x).level === "hard");
  for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
    const d = addDays(today, i);
    if (limit && d >= limit) break;
    if (dayItems(d).length > 0) continue;
    if (c.level === "hard" && (isHardDay(addDays(d, -1)) || isHardDay(addDays(d, 1)))) continue;
    return { ...base, kind: "move", to: d, headline: `You skipped ${w.title}.`, detail: `It is a key session, and ${d} is free with no hard day next to it. Move it there?` };
  }

  const trimmable = workouts
    .filter((x) => x.id !== w.id && x.generated && x.status === "planned" && x.workout_date > today && x.workout_date <= addDays(today, 7) && (x.planned_duration_min ?? 0) > 0 && !classify(x).race && (!limit || x.workout_date < limit))
    .map((x) => x.id);
  if (trimmable.length) {
    return {
      ...base,
      kind: "trim",
      trimIds: trimmable,
      trimPct: TRIM_PCT,
      headline: `You skipped ${w.title}.`,
      detail: `There is no good free day to make it up. Cut the next ${trimmable.length} planned session${trimmable.length === 1 ? "" : "s"} by ${TRIM_PCT}% instead of piling it on.`,
    };
  }
  return { ...base, kind: "drop", headline: `You skipped ${w.title}.`, detail: "There is no room to make it up before it stops being useful. Drop it and keep the plan as it is." };
}

/** A planned duration after a trim, never below 10 minutes and never longer than before. */
export const trimmed = (min: number, pct: number) => Math.min(min, Math.max(10, Math.round(min * (1 - pct / 100))));

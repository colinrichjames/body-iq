import { diffDays, formatDay } from "./dates";
import type { CategoryScore } from "./insights";
import type { Suggestion } from "./progression";
import type { Readiness } from "./readiness";
import { remainingText, type DayTargets } from "./targets";
import type { BodyScan, Race, Workout } from "./types";

/**
 * The coach's deterministic brain: it matches what you typed to a question it can answer, and every answer is built
 * from numbers passed in (your logged data). It never makes a number up; with no data it says so.
 */

export type Intent =
  | { kind: "today" }
  | { kind: "fuel" }
  | { kind: "lift_last"; query: string | null }
  | { kind: "lift_next"; query: string | null }
  | { kind: "body_weight" }
  | { kind: "score" }
  | { kind: "readiness" }
  | { kind: "race" }
  | { kind: "session" }
  | { kind: "help" }
  | { kind: "unknown" };

export type Reply = { text: string; lines?: string[]; links?: { label: string; href: string }[]; suggestions?: string[] };

export const STARTERS = ["What's my workout today?", "How am I doing on fuel today?", "What did I lift last time?", "Why did my weight change?", "Break down my Body IQ score", "Am I ready to train hard?"];

const LIFT_WORDS = "squat|bench|deadlift|press|row|curl|pull-?ups?|push-?ups?|lunges?|plank|hip thrust|pulldown|pushdown|leg press|rdl|dumbbell|barbell";

/** Picks the question from free text. Order matters: the more specific questions come first. */
export function parseIntent(raw: string): Intent {
  const t = raw.toLowerCase().replace(/[?!.]+$/g, "").trim();
  if (!t) return { kind: "help" };
  if (/^(help|what can you (do|answer)|commands?|how do(es)? this work)\b/.test(t)) return { kind: "help" };
  if (/\b(this|that) (session|workout)\b|about this (session|workout)/.test(t)) return { kind: "session" };
  const lift = new RegExp(`\\b(${LIFT_WORDS})\\b`).test(t);
  const query = lift ? t.replace(/^.*?\b(?:my|the|on|for|of|did i|i)\s+/, "").replace(/\b(last time|next time|weight|why|what|is|was|did|do|i|my|the|to|go|up|change[d]?|suggested|lift|lifted|squatted|benched)\b/g, " ").replace(/\s+/g, " ").trim() || null : null;
  if (lift && /\b(why|next time|should i|go up|increase|suggest|how much)\b/.test(t) && !/\blast time\b/.test(t)) return { kind: "lift_next", query };
  if (lift && /\b(last|previous|did i|lifted|squatted|benched|history|pr|best)\b/.test(t)) return { kind: "lift_last", query };
  if (lift) return { kind: "lift_last", query };
  if (/\b(why|what).*(weight|scale|lbs?|pounds)\b|\b(weight|scale)\b.*\b(change|changed|up|down|gain|lose|trend)\b|\bam i (losing|gaining)\b|\bbody ?weight\b/.test(t)) return { kind: "body_weight" };
  if (/\b(score|body iq)\b/.test(t)) return { kind: "score" };
  if (/\b(ready|readiness|recover|recovery|sore|tired|rest day|train hard|take it easy)\b/.test(t)) return { kind: "readiness" };
  if (/\b(fuel|calories?|cal|protein|carbs?|macros?|eat|eaten|ate|food|target)\b/.test(t)) return { kind: "fuel" };
  if (/\b(race|marathon|hyrox|half|triathlon|taper)\b/.test(t)) return { kind: "race" };
  if (/\b(today|workout|session|train|training|plan|run|lift|gym|schedule)\b/.test(t)) return { kind: "today" };
  return { kind: "unknown" };
}

/** The logged exercise name that best matches the words typed ("squat" finds "Back Squat"). Most recent first in `names`. */
export function findExercise(query: string | null, names: string[]): string | null {
  const q = (query ?? "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").trim();
  if (!q) return null;
  const words = q.split(/\s+/).filter((w) => w.length >= 3).map((w) => w.replace(/s$/, ""));
  if (!words.length) return null;
  const exact = names.find((n) => n.toLowerCase() === q);
  if (exact) return exact;
  return names.find((n) => words.every((w) => n.toLowerCase().includes(w))) ?? names.find((n) => words.some((w) => n.toLowerCase().includes(w))) ?? null;
}

const lbs = (n: number) => `${Math.round(n * 10) / 10} lb`;
const min = (w: Pick<Workout, "planned_duration_min" | "actual_duration_min" | "status">) => (w.status === "completed" ? (w.actual_duration_min ?? w.planned_duration_min) : (w.planned_duration_min ?? w.actual_duration_min));

export const helpReply = (): Reply => ({
  text: "I answer from what you've logged, and I say so when I don't have the data. Try one of these:",
  suggestions: STARTERS,
});

export const unknownReply = (): Reply => ({
  text: "I can't answer that from your data yet. I can cover your sessions, fuel, lifts, weight, Body IQ score, readiness and races.",
  suggestions: STARTERS,
});

export function todayReply(today: string, todays: Workout[], upcoming: Workout | null): Reply {
  const live = todays.filter((w) => w.status !== "skipped");
  if (!live.length) {
    return {
      text: todays.length ? "Today's session is marked skipped." : "Nothing is planned for today.",
      lines: upcoming ? [`Next up: ${upcoming.title}, ${formatDay(upcoming.workout_date)}${min(upcoming) ? `, ${min(upcoming)} min` : ""}.`] : ["No upcoming sessions are scheduled."],
      links: [{ label: "Open Train", href: "/workouts" }],
    };
  }
  return {
    text: live.length === 1 ? "You have one session today:" : `You have ${live.length} sessions today:`,
    lines: live.map((w) => `${w.title}${min(w) ? `, ${min(w)} min` : ""} (${w.status === "completed" ? "done" : w.status === "in_progress" ? "in progress" : "planned"})`),
    links: live.map((w) => ({ label: w.title, href: `/workouts/${w.id}` })),
  };
}

export function fuelReply(day: string, totals: { calories: number; protein: number; carbs: number; fat: number } | null, t: DayTargets): Reply {
  if (!totals || totals.calories <= 0) {
    return { text: "Nothing is logged for today yet.", lines: [t.calories ? `Your target is ${t.calories} cal${t.protein ? `, ${t.protein} g protein` : ""}.` : "You haven't set a calorie target yet."], links: [{ label: "Log food", href: "/nutrition/log" }] };
  }
  const row = (label: string, eaten: number, target: number | null, unit: string) => (target ? `${label}: ${Math.round(eaten)}${unit} of ${target}${unit} (${remainingText(target, eaten, unit)})` : `${label}: ${Math.round(eaten)}${unit} (no target set)`);
  return {
    text: `Here is ${day} so far, from your food log:`,
    lines: [row("Calories", totals.calories, t.calories, ""), row("Protein", totals.protein, t.protein, " g"), row("Carbs", totals.carbs, t.carbs, " g"), row("Fat", totals.fat, t.fat, " g")],
    links: [{ label: "Open Fuel", href: "/nutrition" }],
  };
}

export type LiftSession = { date: string; sets: { weight: number | null; reps: number | null; rpe: number | null; skipped: boolean }[] };

export function lastLiftReply(exercise: string | null, asked: string | null, sessions: LiftSession[]): Reply {
  if (!exercise) {
    return { text: asked ? `I don't have any logged sets matching "${asked}".` : "Which lift? For example: what did I squat last time?", suggestions: ["What did I squat last time?", "What did I bench last time?"] };
  }
  const last = sessions[0];
  if (!last) return { text: `I don't have any finished sets for ${exercise} yet.` };
  const done = last.sets.filter((s) => !s.skipped && s.reps !== null);
  const skipped = last.sets.filter((s) => s.skipped).length;
  const line = done.map((s) => `${s.weight ? `${lbs(s.weight)} × ` : ""}${s.reps}${s.rpe ? ` @${s.rpe}` : ""}`).join(", ");
  const best = done.reduce<number | null>((a, s) => (s.weight && (a === null || s.weight > a) ? s.weight : a), null);
  return {
    text: `${exercise}, last done ${formatDay(last.date, { weekday: true })}:`,
    lines: [line || "No completed sets were logged that day.", ...(skipped ? [`${skipped} set${skipped === 1 ? "" : "s"} skipped.`] : []), ...(best && sessions.length > 1 ? [`Seen in ${sessions.length} recent sessions; heaviest that day was ${lbs(best)}.`] : [])],
  };
}

export function nextLiftReply(exercise: string | null, asked: string | null, sug: Suggestion | null, reps: number | null): Reply {
  if (!exercise) return { text: asked ? `I don't have any logged sets matching "${asked}", so I can't say.` : "Which lift? For example: should I go up on squat?" };
  if (!sug) return { text: `I don't have enough finished, weighted sets of ${exercise} to suggest a weight.` };
  const verb = sug.weight > sug.from ? `up from ${lbs(sug.from)} to ${lbs(sug.weight)}` : sug.weight < sug.from ? `down from ${lbs(sug.from)} to ${lbs(sug.weight)}` : `stay at ${lbs(sug.weight)}`;
  return { text: `${exercise}: ${verb}.`, lines: [sug.reason, ...(reps ? [`Worked out for ${reps} reps, from your recent sessions.`] : [])] };
}

export function bodyWeightReply(scans: BodyScan[], opts: { trendWeight: number | null; ratePerWeek: number | null; avgCalories: number | null; targetCalories: number | null; loggedDays: number }): Reply {
  const [a, b] = scans.filter((s) => s.weight_lb !== null);
  const lines: string[] = [];
  if (a && b) {
    const d = Math.round((Number(a.weight_lb) - Number(b.weight_lb)) * 10) / 10;
    lines.push(`Latest scan ${lbs(Number(a.weight_lb))} on ${formatDay(a.scanned_at.slice(0, 10))}; the one before was ${lbs(Number(b.weight_lb))} on ${formatDay(b.scanned_at.slice(0, 10))} (${d > 0 ? "+" : ""}${d} lb).`);
  } else if (a) {
    lines.push(`Your only scan is ${lbs(Number(a.weight_lb))} on ${formatDay(a.scanned_at.slice(0, 10))}, so there is nothing to compare yet.`);
  }
  if (opts.trendWeight !== null) lines.push(`Smoothed trend: ${lbs(opts.trendWeight)}${opts.ratePerWeek !== null ? `, ${opts.ratePerWeek > 0 ? "+" : ""}${Math.round(opts.ratePerWeek * 10) / 10} lb/week` : ""}.`);
  if (opts.avgCalories !== null && opts.loggedDays >= 3) {
    lines.push(`You logged food on ${opts.loggedDays} of the last 7 days, averaging ${Math.round(opts.avgCalories)} cal${opts.targetCalories ? ` against a ${opts.targetCalories} cal target` : ""}.`);
  }
  if (!lines.length) return { text: "I don't have any weight logged yet, so I can't say what changed.", links: [{ label: "Log a scan", href: "/scans" }] };
  return { text: "Here is what your logs show:", lines: [...lines, "Daily scale changes mostly come from water, food in the gut and salt, which I can't see. I can only point to what's logged."], links: [{ label: "Open scans", href: "/scans" }] };
}

export function scoreReply(score: number | null, available: number, categories: CategoryScore[]): Reply {
  if (score === null || available < 3) {
    return { text: `Your Body IQ score needs 3 of 5 categories with data; ${available} ${available === 1 ? "has" : "have"} data so far.`, lines: categories.map((c) => `${c.label}: ${c.score === null ? `no score${c.missing ? ` (missing: ${c.missing})` : ""}` : `${c.score} / ${c.max}`}`) };
  }
  return { text: `Your Body IQ score is ${score}${available < 5 ? " (provisional)" : ""}:`, lines: categories.map((c) => `${c.label}: ${c.score === null ? `no score${c.missing ? ` (missing: ${c.missing})` : ""}` : `${c.score} / ${c.max}. ${c.note}`}`), links: [{ label: "Open the breakdown", href: "/dashboard" }] };
}

export function readinessReply(r: Readiness | null, hardToday: Workout | null): Reply {
  if (!r) return { text: "I don't have any sleep, soreness or Garmin data yet, so I can't judge readiness.", links: [{ label: "Do a check-in", href: "/recovery" }] };
  return {
    text: `${r.headline} (${r.status}).`,
    lines: [...r.reasons, ...(hardToday && r.status !== "green" ? [`You have a hard session planned today: ${hardToday.title}.`] : [])],
    links: [{ label: "Open recovery", href: "/recovery" }],
  };
}

export function raceReply(race: Race | null, today: string, phase: string | null): Reply {
  if (!race) return { text: "You don't have an upcoming race saved.", links: [{ label: "Add a race", href: "/races" }] };
  const d = diffDays(today, race.race_date);
  return { text: `${race.name} is ${d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`} (${formatDay(race.race_date, { weekday: true, year: true })}).`, lines: [...(phase ? [phase] : []), ...(race.goal_time_sec ? [] : ["No goal time is set."])], links: [{ label: "Open race", href: `/races/${race.id}` }] };
}

export function sessionReply(w: Workout | null, sets: { exercise: string; weight: number | null; reps: number | null; skipped: boolean }[]): Reply {
  if (!w) return { text: "Open a session and tap Ask coach there, and I'll talk about that one." };
  const done = sets.filter((s) => !s.skipped && s.reps !== null).length;
  const skipped = sets.filter((s) => s.skipped).length;
  const lines = [`${w.status === "completed" ? "Done" : w.status === "in_progress" ? "In progress" : w.status === "skipped" ? "Skipped" : "Planned"} for ${formatDay(w.workout_date, { weekday: true })}${min(w) ? `, ${min(w)} min` : ""}.`];
  if (sets.length) lines.push(`${done} set${done === 1 ? "" : "s"} logged${skipped ? `, ${skipped} skipped` : ""}.`);
  if (w.actual_distance_km) lines.push(`Distance logged: ${Math.round(Number(w.actual_distance_km) * 100) / 100} km.`);
  if (w.rpe) lines.push(`Effort: RPE ${w.rpe}.`);
  return { text: `${w.title}:`, lines, links: [{ label: "Open session", href: `/workouts/${w.id}` }] };
}

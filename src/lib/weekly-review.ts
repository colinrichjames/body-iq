import { addDays, formatDay, startOfWeek, weekdayIndex } from "./dates";
import type { Reply } from "./coach-chat";

/**
 * The Monday review, computed from what was actually logged for the week that just ended (Monday to Sunday). A line
 * appears only when there is data behind it; with too little data the review says so instead of guessing.
 */

export type ReviewInput = {
  today: string;
  workouts: { workout_date: string; status: string; title: string; planned_duration_min: number | null; actual_duration_min?: number | null }[];
  nutrition: { day: string; calories: number | null; protein_g: number | null }[];
  checkins: { day: string; sleep_hours: number | null; soreness: number | null; energy: number | null }[];
  weights: { day: string; weight: number }[];
  targets: { calories: number | null; protein: number | null };
};

export const isMonday = (today: string) => weekdayIndex(today) === 0;

/** The week being reviewed: the Monday to Sunday before `today`'s week. */
export function reviewWeek(today: string): { start: string; end: string } {
  const start = addDays(startOfWeek(today), -7);
  return { start, end: addDays(start, 6) };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Returns null when there is nothing logged to review. */
export function weeklyReview(i: ReviewInput): Reply | null {
  const { start, end } = reviewWeek(i.today);
  const inWeek = (d: string) => d >= start && d <= end;
  const ws = i.workouts.filter((w) => inWeek(w.workout_date));
  const done = ws.filter((w) => w.status === "completed");
  const skipped = ws.filter((w) => w.status === "skipped");
  const missed = ws.filter((w) => w.status === "planned" || w.status === "in_progress");
  const due = done.length + skipped.length + missed.length;
  const food = i.nutrition.filter((d) => inWeek(d.day) && (d.calories ?? 0) > 0);
  const checks = i.checkins.filter((c) => inWeek(c.day));
  const weights = i.weights.filter((w) => inWeek(w.day)).sort((a, b) => (a.day < b.day ? -1 : 1));
  if (!due && !food.length && !checks.length && weights.length < 2) return null;

  const lines: string[] = [];
  if (due) {
    const mins = done.map((w) => w.actual_duration_min ?? w.planned_duration_min).filter((m): m is number => typeof m === "number" && m > 0);
    lines.push(`Training: ${done.length} of ${due} planned session${due === 1 ? "" : "s"} done${skipped.length ? `, ${skipped.length} skipped` : ""}${missed.length ? `, ${missed.length} not done` : ""}${mins.length ? `, about ${Math.round(mins.reduce((a, b) => a + b, 0))} min logged` : ""}.`);
    const names = [...skipped, ...missed].slice(0, 3).map((w) => w.title);
    if (names.length) lines.push(`Not done: ${names.join(", ")}.`);
  } else lines.push("Training: nothing was planned or logged.");

  if (food.length) {
    const cal = avg(food.map((d) => d.calories ?? 0))!;
    let l = `Fuel: logged ${food.length} of 7 days, averaging ${Math.round(cal)} cal`;
    if (i.targets.calories) l += ` against a ${i.targets.calories} target`;
    const prot = food.filter((d) => (d.protein_g ?? 0) > 0);
    if (i.targets.protein && prot.length) l += `; protein target hit on ${prot.filter((d) => (d.protein_g ?? 0) >= i.targets.protein! * 0.95).length} of ${prot.length} days`;
    lines.push(`${l}.`);
    if (food.length < 4) lines.push("That's too few logged days to read much into your averages.");
  } else lines.push("Fuel: no food logged that week, so I have nothing to say about it.");

  const sleep = checks.map((c) => c.sleep_hours).filter((v): v is number => v !== null);
  const sore = checks.map((c) => c.soreness).filter((v): v is number => v !== null);
  if (sleep.length || sore.length) lines.push(`Recovery: ${[sleep.length ? `sleep averaged ${round1(avg(sleep)!)} h (${sleep.length} check-in${sleep.length === 1 ? "" : "s"})` : "", sore.length ? `soreness averaged ${round1(avg(sore)!)} of 5` : ""].filter(Boolean).join(", ")}.`);

  if (weights.length >= 2) {
    const d = round1(weights[weights.length - 1].weight - weights[0].weight);
    lines.push(`Weight: ${d === 0 ? "unchanged" : `${d > 0 ? "up" : "down"} ${Math.abs(d)} lb`} from ${formatDay(weights[0].day)} to ${formatDay(weights[weights.length - 1].day)} (${weights.length} weigh-ins; single readings are noisy).`);
  }

  return { text: `Your week, ${formatDay(start)} to ${formatDay(end)}:`, lines, links: [{ label: "Open stats", href: "/stats" }], suggestions: ["Break down my Body IQ score", "What's my workout today?"] };
}

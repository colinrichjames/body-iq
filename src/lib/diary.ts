import { addDays, weekdayIndex } from "./dates";

export const DIARY_MEALS = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snack", label: "Snacks" },
] as const;
export type DiaryMeal = (typeof DIARY_MEALS)[number]["key"];

/** The Sunday-to-Saturday week containing `day`. */
export function sundayWeek(day: string): string[] {
  const start = addDays(day, -((weekdayIndex(day) + 1) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** "Protein Bar", "Eggs and Toast" or "Protein Bar and 2 more". */
export function mealSummary(names: string[]): string {
  const uniq = names.filter((n, i) => names.indexOf(n) === i);
  if (uniq.length === 0) return "";
  if (uniq.length === 1) return uniq[0];
  if (uniq.length === 2) return `${uniq[0]} and ${uniq[1]}`;
  return `${uniq[0]} and ${uniq.length - 1} more`;
}

/** Bar fill 0-100. No target or a zero target gives 0. */
export const fillPct = (value: number, target: number | null) => (target && target > 0 ? Math.max(0, Math.min(100, Math.round((value / target) * 100))) : 0);

export const isDiaryMeal = (m: string | undefined): m is DiaryMeal => DIARY_MEALS.some((x) => x.key === m);

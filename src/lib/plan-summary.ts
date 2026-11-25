import { formatDay } from "@/lib/dates";

export type PlanResult = { removed: number; added: number; skippedDays: number; first: string | null; last: string | null; weeks: number };

const n = (v: number, one: string, many = `${one}s`) => `${v} ${v === 1 ? one : many}`;

/** One readable sentence about what building (or rebuilding) a plan did. */
export function planSummary(r: PlanResult, mode: "built" | "rebuilt"): string {
  const verb = mode === "built" ? "Race added" : "Plan rebuilt";
  if (r.added === 0) {
    return r.skippedDays > 0
      ? `${verb}, but no sessions were added: all ${n(r.skippedDays, "day")} already had workouts.`
      : `${verb}, but no sessions were added.`;
  }
  const span = r.first && r.last ? `, ${formatDay(r.first)} to ${formatDay(r.last)}` : "";
  const parts = [`${verb}: ${n(r.added, "session")} over ${n(r.weeks, "week")}${span}.`];
  if (mode === "rebuilt" && r.removed > 0) parts.push(`Replaced ${n(r.removed, "unfinished session")}.`);
  if (r.skippedDays > 0) parts.push(`Left ${n(r.skippedDays, "day")} alone that already had workouts.`);
  return parts.join(" ");
}

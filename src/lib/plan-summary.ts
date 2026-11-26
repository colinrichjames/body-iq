import { formatDay } from "@/lib/dates";

export type PlanSession = { date: string; title: string };
export type PlanResult = {
  /** Unfinished generated sessions that were taken out before the new plan went in. */
  removed: number;
  added: number;
  skippedDays: number;
  first: string | null;
  last: string | null;
  weeks: number;
  /** Of the old sessions: how many reappear on another date (moved) or are gone for good (dropped). */
  moved?: number;
  /** New sessions that replace nothing old. */
  fresh?: number;
  dropped?: PlanSession[];
  /** Trash id that puts the removed sessions back. */
  undo?: string | null;
};

const n = (v: number, one: string, many = `${one}s`) => `${v} ${v === 1 ? one : many}`;

/**
 * Splits the old plan against the new one. A session whose title appears in the new plan on the same date is
 * unchanged, on another date it moved, and with no match it was dropped. Returns what is new, moved and dropped.
 */
export function comparePlans(oldSessions: PlanSession[], newSessions: PlanSession[]): { added: number; moved: number; unchanged: number; dropped: PlanSession[] } {
  const pool = [...newSessions];
  const take = (pred: (s: PlanSession) => boolean) => {
    const i = pool.findIndex(pred);
    if (i < 0) return false;
    pool.splice(i, 1);
    return true;
  };
  let unchanged = 0;
  const rest: PlanSession[] = [];
  for (const o of oldSessions) {
    if (take((s) => s.date === o.date && s.title === o.title)) unchanged++;
    else rest.push(o);
  }
  let moved = 0;
  const dropped: PlanSession[] = [];
  for (const o of rest) {
    if (take((s) => s.title === o.title)) moved++;
    else dropped.push(o);
  }
  return { added: pool.length, moved, unchanged, dropped };
}

const name = (s: PlanSession) => `${formatDay(s.date)} ${s.title}`;

/** One readable sentence about what building (or rebuilding) a plan did, naming any session that is now gone. */
export function planSummary(r: PlanResult, mode: "built" | "rebuilt"): string {
  const verb = mode === "built" ? "Race added" : "Plan rebuilt";
  if (r.added === 0 && !r.removed) {
    return r.skippedDays > 0
      ? `${verb}, but no sessions were added: all ${n(r.skippedDays, "day")} already had workouts.`
      : `${verb}, but no sessions were added.`;
  }
  const span = r.first && r.last ? ` ${formatDay(r.first)} to ${formatDay(r.last)}` : "";
  const parts: string[] = [];
  if (mode === "rebuilt") {
    const dropped = r.dropped ?? [];
    const moved = r.moved ?? 0;
    const fresh = r.fresh ?? Math.max(0, r.added - moved);
    parts.push(`${verb}: ${n(fresh, "session")} added, ${moved} moved, ${dropped.length} removed.${span ? ` New plan runs${span}.` : ""}`);
    if (dropped.length) parts.push(`Removed: ${dropped.slice(0, 4).map(name).join("; ")}${dropped.length > 4 ? ` and ${dropped.length - 4} more` : ""}. Undo puts them back.`);
  } else {
    parts.push(`${verb}: ${n(r.added, "session")} over ${n(r.weeks, "week")}${r.first && r.last ? `, ${formatDay(r.first)} to ${formatDay(r.last)}` : ""}.`);
  }
  if (r.skippedDays > 0) parts.push(`Left ${n(r.skippedDays, "day")} alone that already had workouts.`);
  return parts.join(" ");
}

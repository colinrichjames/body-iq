import { diffDays } from "./dates";
import type { Workout } from "./types";

export type Reminder = { key: string; text: string; href: string; action: string };

/** Hour of the day (0-23) in a time zone. */
export function hourIn(timeZone: string, at: Date = new Date()): number {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(at));
  return Number.isFinite(h) ? h % 24 : 12;
}

/**
 * Nudges that are due right now, computed from your data each time the home screen opens. Nothing is sent in the
 * background; for alerts that reach you when the app is closed, use the calendar file in Settings.
 */
export function dueReminders(input: {
  today: string;
  hour: number;
  /** Today's workouts, any status. */
  todays: Pick<Workout, "id" | "title" | "status">[];
  caloriesToday: number;
  lastScanDay: string | null;
}): Reminder[] {
  const out: Reminder[] = [];
  for (const w of input.todays) {
    if (w.status === "in_progress") out.push({ key: `resume-${w.id}`, text: `${w.title} is in progress.`, href: `/workouts/${w.id}/start`, action: "Resume" });
  }
  const next = input.todays.find((w) => w.status === "planned");
  if (next) out.push({ key: `today-${next.id}`, text: `Planned today: ${next.title}.`, href: `/workouts/${next.id}`, action: "Open" });
  if (input.hour >= 18 && input.caloriesToday <= 0) out.push({ key: "food", text: "No food logged today.", href: "/nutrition/log", action: "Log food" });
  if (input.lastScanDay && diffDays(input.lastScanDay, input.today) >= 14) out.push({ key: "scan", text: `Last body scan was ${diffDays(input.lastScanDay, input.today)} days ago.`, href: "/scans", action: "Log a scan" });
  return out;
}

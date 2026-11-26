import { addDays } from "./dates";
import type { OtherRace, Phase, WeekPlan } from "./plan";

export type Session = { id: string; date: string; title: string; sport: string; minutes: number | null; status: string };
export type WeekRow = { index: number; weekStart: string; weekEnd: string; phase: Phase; isRaceWeek: boolean; note?: string; minutes: number; sessions: Session[]; others: OtherRace[] };

/** Puts each week's sessions and the other races that fall in it next to the week's phase, with total planned minutes. */
export function weekRows(weeks: WeekPlan[], sessions: Session[], others: OtherRace[]): WeekRow[] {
  return weeks.map((w, index) => {
    const end = addDays(w.weekStart, 6);
    const mine = sessions.filter((s) => s.date >= w.weekStart && s.date <= end).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return {
      index: index + 1,
      weekStart: w.weekStart,
      weekEnd: end,
      phase: w.phase,
      isRaceWeek: w.isRaceWeek,
      note: w.note,
      minutes: mine.reduce((a, s) => a + (s.minutes ?? 0), 0),
      sessions: mine,
      others: others.filter((o) => o.date >= w.weekStart && o.date <= end),
    };
  });
}

/** Weeks per phase in plan order, e.g. [["base", 4], ["build", 6], ["peak", 2], ["taper", 2]]. */
export function phaseCounts(weeks: Pick<WeekPlan, "phase">[]): [Phase, number][] {
  const out: [Phase, number][] = [];
  for (const w of weeks) {
    const last = out[out.length - 1];
    if (last && last[0] === w.phase) last[1]++;
    else out.push([w.phase, 1]);
  }
  return out;
}

export const hoursText = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ""}`.trim() : `${min}m`);

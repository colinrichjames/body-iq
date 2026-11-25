import { diffDays } from "./dates";
import { sessionTotals } from "./fuel";
import { fmtTime, hyroxSplits, isHyrox } from "./hyrox";
import type { Race } from "./types";

const RACE_KM: Record<string, number> = { marathon: 42.195, half_marathon: 21.0975, "10k": 10, "5k": 5 };
const KM_PER_MI = 1.609344;

export type RaceDayCard = { heading: string; days: number; pacing: string[]; fuel: string[]; before: string[]; checklist: string[] };

const pace = (sec: number, km: number) => `${fmtTime(sec / km)} /km (${fmtTime(sec / (km / KM_PER_MI))} /mi)`;
const range = (r: [number, number], unit: string) => `${r[0].toLocaleString("en-US")}-${r[1].toLocaleString("en-US")} ${unit}`;

/** Race-day card for the last two weeks: pacing, fuelling, the day before, and a short kit list. Null outside that window. */
export function raceDayCard(race: Race, today: string, weightKg: number | null): RaceDayCard | null {
  const days = diffDays(today, race.race_date);
  if (days < 0 || days > 14) return null;
  const goal = race.goal_time_sec;
  const hyrox = isHyrox(race.race_type);
  const tri = race.race_type.startsWith("triathlon");
  const km = RACE_KM[race.race_type];

  const pacing: string[] = [];
  if (hyrox && goal) {
    const p = hyroxSplits(goal);
    pacing.push(`Goal ${fmtTime(goal)}: each 1 km run at about ${fmtTime(p.runSec / 8)}, and about ${fmtTime(p.roxzoneSec)} in total across transitions.`);
    pacing.push("Run 1 should feel too easy. Hold the first two runs at target or a few seconds slower, then go on feel.");
  } else if (km && goal) {
    pacing.push(`Goal ${fmtTime(goal)}: even pace is ${pace(goal, km)}.`);
    pacing.push("Run the first third a touch easier than goal pace. Banking time early usually costs more late.");
  } else if (goal) {
    pacing.push(`Goal ${fmtTime(goal)}. Keep the swim and bike controlled so the run is where you spend what is left.`);
  } else {
    pacing.push("No goal time set. Add one to the race to get a pacing plan.");
  }

  const fuel: string[] = [];
  const totals = goal ? sessionTotals(Math.round(goal / 60), tri ? "bike" : "run") : null;
  if (totals) {
    fuel.push(`Across ${fmtTime(goal!)}: ${range(totals.carbs, "g carbs")}, ${range(totals.fluid, "ml fluid")}, ${range(totals.sodium, "mg sodium")}.`);
    fuel.push("Start fuelling in the first 20-30 minutes and use only products you have rehearsed.");
  } else if (goal) {
    fuel.push("Under 75 minutes: fuel well beforehand; carbs during the race are optional. Sip water as you like.");
  } else {
    fuel.push("Add a goal time to get race fuelling totals. As a rule, 45-75 g carbs per hour past 75 minutes.");
  }

  const kg = (lo: number, hi: number) => (weightKg ? ` (${Math.round(lo * weightKg)}-${Math.round(hi * weightKg)} g at ${Math.round(weightKg)} kg)` : "");
  const before = [
    `Day before: 10-12 g carbs per kg${kg(10, 12)} through the day, low fibre and low fat, no new foods.`,
    `Race morning: 1.5-3 g carbs per kg${kg(1.5, 3)}, 3-4 hours before the start, then sip fluid until the gun.`,
  ];
  const checklist = [
    "Bib, timing chip and race pack collected",
    "Kit and shoes you have already trained in, nothing new",
    "Race fuel and electrolytes packed, plus a spare",
    "Layers and a dry bag for before and after",
    "Start time, travel and parking sorted",
    "Phone charged, watch charged",
  ];
  return { heading: days === 0 ? "Race day" : days === 1 ? "Race is tomorrow" : `Race day in ${days} days`, days, pacing, fuel, before, checklist };
}

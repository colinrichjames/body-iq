import { formatDay } from "./dates";
import { fmtTime } from "./hyrox";
import { raceLabel } from "./plan";
import type { Race } from "./types";

export type RaceFields = Pick<Race, "name" | "race_type" | "race_date" | "location" | "goal" | "priority" | "goal_time_sec">;

export type RaceChange = { field: keyof RaceFields; text: string };

const show = (v: string | null) => v || "none";
const dayText = (d: string) => formatDay(d, { weekday: false, year: true });

/** Plain-language list of what an edit changed, e.g. "Date: Mar 1, 2027 to Mar 8, 2027". */
export function raceChanges(a: RaceFields, b: RaceFields): RaceChange[] {
  const out: RaceChange[] = [];
  if (a.name !== b.name) out.push({ field: "name", text: `Name: ${a.name} to ${b.name}` });
  if (a.race_type !== b.race_type) out.push({ field: "race_type", text: `Type: ${raceLabel(a.race_type)} to ${raceLabel(b.race_type)}` });
  if (a.race_date !== b.race_date) out.push({ field: "race_date", text: `Date: ${dayText(a.race_date)} to ${dayText(b.race_date)}` });
  if (a.priority !== b.priority) out.push({ field: "priority", text: `Priority: ${a.priority} to ${b.priority}` });
  if (a.location !== b.location) out.push({ field: "location", text: `Location: ${show(a.location)} to ${show(b.location)}` });
  if (a.goal_time_sec !== b.goal_time_sec) out.push({ field: "goal_time_sec", text: `Goal time: ${a.goal_time_sec ? fmtTime(a.goal_time_sec) : "none"} to ${b.goal_time_sec ? fmtTime(b.goal_time_sec) : "none"}` });
  if (a.goal !== b.goal) out.push({ field: "goal", text: `Goals: ${show(a.goal)} to ${show(b.goal)}` });
  return out;
}

/** Changes that alter what the training plan should look like. */
export const affectsPlan = (changes: RaceChange[]) => changes.some((c) => c.field === "race_date" || c.field === "race_type" || c.field === "priority");

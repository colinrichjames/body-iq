import { describe, expect, it } from "vitest";
import { affectsPlan, raceChanges, type RaceFields } from "./race-edit";

const base: RaceFields = { name: "Seattle Half", race_type: "half_marathon", race_date: "2027-03-01", location: "Seattle", goal: null, priority: "A", goal_time_sec: 4800 };

describe("raceChanges", () => {
  it("returns nothing when nothing changed", () => {
    expect(raceChanges(base, { ...base })).toEqual([]);
  });
  it("describes each change in plain words", () => {
    const c = raceChanges(base, { ...base, race_date: "2027-03-08", goal_time_sec: 4500, location: null });
    expect(c.map((x) => x.text)).toEqual(["Date: Mar 1, 2027 to Mar 8, 2027", "Location: Seattle to none", "Goal time: 1:20:00 to 1:15:00"]);
  });
  it("only date, type and priority affect the plan", () => {
    expect(affectsPlan(raceChanges(base, { ...base, name: "New", goal: "PR" }))).toBe(false);
    expect(affectsPlan(raceChanges(base, { ...base, race_date: "2027-03-08" }))).toBe(true);
    expect(affectsPlan(raceChanges(base, { ...base, priority: "B" }))).toBe(true);
  });
});

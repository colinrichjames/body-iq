import { describe, expect, it } from "vitest";
import { findDoubleBookings, generatePlan, RACE_TYPES, spreadWeek } from "./plan";
import type { RaceType } from "./types";

const base = { raceName: "Test", startDate: "2026-11-27" };
const dates: Record<string, string> = {};
const raceDateFor = (t: RaceType) => dates[t] ?? "2027-05-15";

describe("one session a day", () => {
  for (const r of RACE_TYPES) {
    it(`${r.label}: no day holds two sessions (default week, every priority)`, () => {
      for (const priority of ["A", "B", "C"] as const) {
        const plan = generatePlan({ ...base, raceType: r.value, raceDate: raceDateFor(r.value), priority });
        expect(findDoubleBookings(plan)).toEqual([]);
      }
    });
    it(`${r.label}: no day holds two sessions with the user's own training days`, () => {
      const plan = generatePlan({ ...base, raceType: r.value, raceDate: raceDateFor(r.value), prefs: { days: [0, 1, 2, 3, 4, 5, 6], longDay: 5 } });
      expect(findDoubleBookings(plan)).toEqual([]);
    });
  }

  it("the HYROX Thursday double (push and legs) no longer stacks: Dec 3 holds one session and the other is on a free day that week", () => {
    const plan = generatePlan({ ...base, raceType: "hyrox_single", raceDate: "2027-05-15", priority: "A" });
    const week2 = plan.filter((w) => w.workout_date >= "2026-11-30" && w.workout_date <= "2026-12-06");
    const dec3 = week2.filter((w) => w.workout_date === "2026-12-03");
    expect(dec3).toHaveLength(1);
    const titles = week2.map((w) => w.title.toLowerCase());
    expect(titles.some((t) => t.includes("push"))).toBe(true);
    expect(titles.some((t) => t.includes("legs"))).toBe(true);
    expect(new Set(week2.map((w) => w.workout_date)).size).toBe(week2.length);
  });

  it("a triathlon brick stays together", () => {
    const plan = generatePlan({ ...base, raceType: RACE_TYPES.find((r) => r.family === "tri")!.value, raceDate: "2027-05-15" });
    const brickDays = plan.filter((w) => w.title.startsWith("Brick")).map((w) => w.workout_date);
    expect(brickDays.length).toBeGreaterThan(0);
    for (const d of brickDays) expect(plan.filter((w) => w.workout_date === d).length).toBe(2);
  });
});

describe("spreadWeek", () => {
  const d = (title: string) => ({ sport: "strength" as const, title, description: "", planned_duration_min: 50, structure: null });
  it("moves the second session to the next free allowed day, falling back to an earlier one", () => {
    const week = [[d("a")], [], [], [d("b"), d("c")], [], [], []];
    const out = spreadWeek(week);
    expect(out[3].map((x) => x.title)).toEqual(["b"]);
    expect(out[4].map((x) => x.title)).toEqual(["c"]);
    const late = spreadWeek([[], [], [], [], [], [], [d("x"), d("y")]]);
    expect(late[6]).toHaveLength(1);
    expect(late[5]).toHaveLength(1);
  });
  it("respects the user's training days and drops an extra only when no day is free", () => {
    const out = spreadWeek([[d("a")], [], [], [d("b"), d("c")], [], [], []], [0, 3]);
    expect(out[3]).toHaveLength(1);
    expect(out.flat().map((x) => x.title).sort()).toEqual(["a", "b"]);
  });
});

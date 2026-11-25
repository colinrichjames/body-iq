import { describe, expect, it } from "vitest";
import { raceDayCard } from "./race-day";
import type { Race } from "./types";

const race = (o: Partial<Race>) => ({ id: "r", name: "R", race_type: "half_marathon", race_date: "2026-12-06", goal_time_sec: 6000, priority: "A", ...o }) as unknown as Race;

describe("raceDayCard", () => {
  it("only shows in the last two weeks", () => {
    expect(raceDayCard(race({}), "2026-11-20", null)).toBeNull();
    expect(raceDayCard(race({}), "2026-11-22", null)).not.toBeNull();
    expect(raceDayCard(race({}), "2026-12-07", null)).toBeNull();
  });
  it("gives pace per km and per mile and fuel totals for a 100 minute half", () => {
    const c = raceDayCard(race({}), "2026-12-01", 70)!;
    expect(c.heading).toBe("Race day in 5 days");
    expect(c.pacing[0]).toMatch(/4:44 \/km \(7:38 \/mi\)/);
    expect(c.fuel[0]).toMatch(/75-125 g carbs/);
    expect(c.before[0]).toMatch(/700-840 g at 70 kg/);
  });
  it("uses Hyrox run splits", () => {
    const c = raceDayCard(race({ race_type: "hyrox_single", goal_time_sec: 4800 }), "2026-12-06", null)!;
    expect(c.heading).toBe("Race day");
    expect(c.pacing[0]).toMatch(/each 1 km run at about 5:00/);
  });
  it("says so when there is no goal time", () => {
    expect(raceDayCard(race({ goal_time_sec: null }), "2026-12-05", null)!.pacing[0]).toMatch(/No goal time/);
  });
  it("short races skip in-race carbs", () => {
    expect(raceDayCard(race({ race_type: "5k", goal_time_sec: 1500 }), "2026-12-05", null)!.fuel[0]).toMatch(/Under 75 minutes/);
  });
});

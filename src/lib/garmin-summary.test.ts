import { describe, expect, it } from "vitest";
import { formatDistance, formatDuration, kindOf, paceOrSpeed, plural, stepWeek, todaysActivities, weekTotals, type Act } from "./garmin-summary";

const a = (o: Partial<Act>): Act => ({ id: "1", sport: "walking", title: null, started_at: "2026-11-26T19:00:00Z", duration_sec: 6671, distance_m: 7080, avg_hr: null, ...o });

describe("garmin summary", () => {
  it("groups type keys", () => {
    expect(kindOf("walking")).toBe("Walk");
    expect(kindOf("treadmill_running")).toBe("Run");
    expect(kindOf("road_biking")).toBe("Ride");
    expect(kindOf("hiking")).toBe("Hike");
    expect(kindOf("strength_training")).toBe("Workout");
    expect(kindOf(null)).toBe("Workout");
  });
  it("formats duration, distance and pace like Garmin", () => {
    expect(formatDuration(6671)).toBe("1:51:11");
    expect(formatDuration(1925)).toBe("32:05");
    expect(formatDistance(7080, "imperial")).toBe("4.4 mi");
    expect(formatDistance(7080, "metric")).toBe("7.08 km");
    expect(formatDistance(0, "imperial")).toBeNull();
    expect(paceOrSpeed("Walk", a({}), "imperial")).toBe("25:16 /mi");
    expect(paceOrSpeed("Ride", a({ duration_sec: 3600, distance_m: 16093.44 }), "imperial")).toBe("10.0 mph");
    expect(paceOrSpeed("Workout", a({}), "imperial")).toBeNull();
    expect(paceOrSpeed("Walk", a({ distance_m: null }), "imperial")).toBeNull();
  });
  it("finds today's activities in the viewer's timezone, newest first", () => {
    const acts = [a({ id: "x", started_at: "2026-11-26T08:00:00Z" }), a({ id: "y", started_at: "2026-11-26T19:00:00Z" }), a({ id: "z", started_at: "2026-11-25T19:00:00Z" })];
    // 08:00Z is 00:00 in Los Angeles on the 26th; 2026-11-26T05:00Z would still be the 25th
    expect(todaysActivities(acts, "2026-11-26", "America/Los_Angeles").map((x) => x.id)).toEqual(["y", "x"]);
  });
  it("rolls up the week with distance or time per kind", () => {
    const t = weekTotals([a({ distance_m: 5000 }), a({ distance_m: 4100 }), a({ sport: "strength_training", distance_m: null, duration_sec: 3600 }), a({ sport: "strength_training", distance_m: null, duration_sec: 600 })], "imperial");
    expect(t.map((x) => [x.kind, x.count, x.label])).toEqual([
      ["Walk", 2, "5.65 mi"],
      ["Workout", 2, "1:10:00"],
    ]);
    expect(plural("Walk", 4)).toBe("Walks");
    expect(plural("Ride", 1)).toBe("Ride");
  });
  it("marks days that hit the step goal", () => {
    const w = stepWeek([{ day: "2026-11-26", steps: 8915 }, { day: "2026-11-24", steps: 11000 }], "2026-11-26");
    expect(w).toHaveLength(7);
    expect(w[6]).toMatchObject({ day: "2026-11-26", isToday: true, met: false, letter: "T" });
    expect(w.find((d) => d.day === "2026-11-24")?.met).toBe(true);
  });
});

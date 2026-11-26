import { describe, expect, it } from "vitest";
import { formatSynced, planImport, sportFor, titleFor, activityFields, type Act, type WorkoutLite } from "./garmin-import";

const act = (o: Partial<Act>): Act => ({ id: "a1", sport: "walking", title: null, started_at: "2026-11-26T19:00:00Z", duration_sec: 1800, distance_m: 2400, avg_hr: 110, avg_power: null, ...o });
const day = (iso: string) => iso.slice(0, 10);

describe("garmin import", () => {
  it("maps Garmin types to sports", () => {
    expect(sportFor("running")).toBe("run");
    expect(sportFor("treadmill_running")).toBe("run");
    expect(sportFor("indoor_cycling")).toBe("bike");
    expect(sportFor("lap_swimming")).toBe("swim");
    expect(sportFor("strength_training")).toBe("strength");
    expect(sportFor("walking")).toBe("other");
    expect(sportFor(null)).toBe("other");
  });
  it("titles walks and falls back from the type key", () => {
    expect(titleFor({ title: " Evening Walk ", sport: "walking" })).toBe("Evening Walk");
    expect(titleFor({ title: null, sport: "walking" })).toBe("Walk");
    expect(titleFor({ title: null, sport: "stand_up_paddleboarding" })).toBe("Stand up paddleboarding");
    expect(titleFor({ title: null, sport: null })).toBe("Workout");
  });
  it("creates a completed workout for an unplanned walk", () => {
    const p = planImport([act({})], [], day);
    expect(p.create).toHaveLength(1);
    expect(p.attach).toHaveLength(0);
  });
  it("attaches to the single planned session of the same sport that day", () => {
    const w: WorkoutLite[] = [{ id: "w1", workout_date: "2026-11-26", sport: "run", status: "planned", activity_id: null }];
    const p = planImport([act({ sport: "running" })], w, day);
    expect(p.attach).toEqual([{ workoutId: "w1", activity: expect.objectContaining({ id: "a1" }) }]);
    expect(p.create).toHaveLength(0);
  });
  it("does not guess when two planned sessions match, and skips linked or tiny activities", () => {
    const two: WorkoutLite[] = [
      { id: "w1", workout_date: "2026-11-26", sport: "run", status: "planned", activity_id: null },
      { id: "w2", workout_date: "2026-11-26", sport: "run", status: "planned", activity_id: null },
    ];
    expect(planImport([act({ sport: "running" })], two, day).create).toHaveLength(1);
    const linked: WorkoutLite[] = [{ id: "w3", workout_date: "2026-11-26", sport: "other", status: "completed", activity_id: "a1" }];
    expect(planImport([act({})], linked, day)).toEqual({ attach: [], create: [] });
    expect(planImport([act({ duration_sec: 60 })], [], day).create).toHaveLength(0);
  });
  it("fills workout fields from an activity", () => {
    expect(activityFields(act({}))).toMatchObject({ actual_duration_min: 30, actual_distance_km: 2.4, avg_hr: 110, activity_id: "a1" });
    expect(activityFields(act({ distance_m: null })).actual_distance_km).toBeNull();
  });
  it("formats sync times in the viewer's timezone", () => {
    const now = new Date("2026-11-26T21:00:00Z"); // 1 PM in Los Angeles
    expect(formatSynced("2026-11-26T20:10:00Z", "America/Los_Angeles", now)).toBe("Today 12:10 PM");
    expect(formatSynced("2026-11-25T17:02:00Z", "America/Los_Angeles", now)).toBe("Yesterday 9:02 AM");
    expect(formatSynced("2026-11-20T17:02:00Z", "America/Los_Angeles", now)).toBe("Nov 20, 9:02 AM");
  });
});

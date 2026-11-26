import { describe, expect, it } from "vitest";
import { canStartOrFinish, headerFacts } from "./workout-header";

const w = (o: Record<string, unknown>) => ({ status: "planned" as const, sport: "run" as const, planned_duration_min: 30, planned_distance_km: 4.989, actual_duration_min: null, actual_distance_km: null, ...o });

describe("headerFacts", () => {
  it("shows the plan for a planned run", () => {
    expect(headerFacts(w({}), "mi")).toEqual(["30 min", "3.1 mi"]);
  });
  it("shows the actual duration, distance and pace for a finished run", () => {
    expect(headerFacts(w({ status: "completed", actual_duration_min: 31, actual_distance_km: 4.989 }), "mi")).toEqual(["31 min", "3.1 mi", "10:00 /mi"]);
  });
  it("falls back to the plan only for what wasn't recorded", () => {
    expect(headerFacts(w({ status: "completed", actual_duration_min: 31 }), "mi")).toEqual(["31 min", "3.1 mi", "10:00 /mi"]);
    expect(headerFacts(w({ status: "completed", planned_duration_min: 45, planned_distance_km: null }), "mi")).toEqual(["45 min"]);
  });
  it("does not give a per-mile pace for a swim", () => {
    expect(headerFacts(w({ status: "completed", sport: "swim", actual_duration_min: 40, actual_distance_km: 1.5 }), "km")).toEqual(["40 min", "1.5 km"]);
  });
});

describe("canStartOrFinish", () => {
  it("is true only for planned and in-progress sessions", () => {
    expect(canStartOrFinish("planned")).toBe(true);
    expect(canStartOrFinish("in_progress")).toBe(true);
    expect(canStartOrFinish("completed")).toBe(false);
    expect(canStartOrFinish("skipped")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { copyRow } from "./workout-copy";
import type { Workout } from "./types";

const source: Workout = {
  id: "w1", user_id: "u1", workout_date: "2026-11-27", sport: "run", title: "Timer check run edited", description: "Easy shake-out",
  planned_duration_min: 20, structure: { exercises: [{ name: "Strides", sets: 4, reps: 6 }] } as never, status: "completed", progress: null,
  block_results: null, race_id: "r1", generated: true, actual_duration_min: 22, actual_distance_km: 3.5, planned_distance_km: 3.2187, distance_unit: "mi",
  avg_hr: 150, avg_power: null, activity_id: "a1", rpe: 6, notes: "felt good", fuel_carbs_g: 30, fluid_ml: 500, sodium_mg: 200,
  completed_at: "2026-11-27T10:00:00Z", created_at: "2026-11-20T10:00:00Z",
};

describe("copyRow", () => {
  it("keeps the planned distance and its unit, so a 20 min / 2 mi run copies as 20 min / 2 mi", () => {
    const c = copyRow(source, "u1", "2026-11-28");
    expect(c.planned_distance_km).toBe(3.2187);
    expect(c.distance_unit).toBe("mi");
    expect(c.planned_duration_min).toBe(20);
  });
  it("carries every plan field", () => {
    const c = copyRow(source, "u1", "2026-11-28");
    expect(c).toMatchObject({ sport: "run", title: source.title, description: source.description, structure: source.structure, workout_date: "2026-11-28" });
  });
  it("is a fresh planned session with no results", () => {
    const c = copyRow(source, "u1", "2026-11-28") as Record<string, unknown>;
    expect(c.status).toBe("planned");
    expect(c.generated).toBe(false);
    for (const k of ["actual_duration_min", "actual_distance_km", "avg_hr", "rpe", "notes", "activity_id", "race_id", "completed_at", "id"]) expect(k in c).toBe(false);
  });
});

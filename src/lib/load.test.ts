import { describe, expect, it } from "vitest";
import { computeLoad } from "./load";
import type { Workout } from "./types";

const w = (o: Partial<Workout>) => ({ id: Math.random().toString(), sport: "run", title: "Easy run", status: "planned", planned_duration_min: 45, actual_duration_min: null, rpe: null, workout_date: "2026-11-24", ...o }) as unknown as Workout;
const calc = (week: Workout[]) => computeLoad(week, "2026-11-25", "2026-11-23", week);

describe("training load", () => {
  it("completing a session never changes planned load and actual only reflects what was logged", () => {
    const before = calc([w({ title: "Tempo run" })]);
    const after = calc([w({ title: "Tempo run", status: "completed", actual_duration_min: 30, rpe: 7 })]);
    expect(after.weekPlannedLoad).toBe(before.weekPlannedLoad);
    expect(before.weekActualLoad).toBe(0);
    expect(after.weekActualLoad).toBe(210);
  });
  it("counts hard days only at logged RPE >= 8", () => {
    expect(calc([w({ status: "completed", rpe: 7, actual_duration_min: 60 })]).weekHardDays).toBe(0);
    expect(calc([w({ status: "completed", rpe: 8, actual_duration_min: 60 })]).weekHardDays).toBe(1);
  });
  it("reports hard sessions still planned", () => {
    expect(calc([w({ title: "Tempo run" })]).weekHardPlanned).toBe(1);
  });
});

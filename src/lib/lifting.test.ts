import { describe, expect, it } from "vitest";
import { detectPRs, est1RM, nextWeights, plannedSetLogs, prText } from "./lifting";

const s = (exercise: string, weight_lb: number | null, reps: number | null, rpe: number | null = null, skipped = false) => ({ exercise, set_number: 1, weight_lb, reps, rpe, skipped });

describe("plannedSetLogs", () => {
  it("writes one row per planned set with plan weights or the last weight used", () => {
    const rows = plannedSetLogs([{ name: "Back squat", sets: 3, reps: 5, weight_lb: 185 }, { name: "Row", sets: 2, reps: 8 }, { name: "Plank", sets: 1, seconds: 45 }], undefined, { Row: 100 });
    expect(rows.filter((r) => r.exercise === "Back squat")).toHaveLength(3);
    expect(rows.filter((r) => r.exercise === "Row").map((r) => r.weight_lb)).toEqual([100, 100]);
    expect(rows.find((r) => r.exercise === "Plank")).toMatchObject({ reps: 45, weight_lb: null });
  });
  it("repeats the circuit for each round", () => {
    const rows = plannedSetLogs([{ name: "A", reps: 10 }, { name: "B", reps: 10 }], 3);
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.set_number)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe("est1RM", () => {
  it("uses Epley and ignores high reps", () => {
    expect(est1RM(200, 5)).toBe(233.3);
    expect(est1RM(200, 1)).toBe(200);
    expect(est1RM(100, 20)).toBeNull();
  });
});

describe("detectPRs", () => {
  const prior = [s("Bench", 135, 5), s("Bench", 145, 3), s("Squat", 200, 5)];
  it("flags a heavier weight", () => {
    const [p] = detectPRs(prior, [s("Bench", 150, 3)]);
    expect(p).toMatchObject({ kind: "weight", value: 150, previous: 145 });
    expect(prText(p)).toContain("was 145 lb");
  });
  it("flags a better estimated 1RM at the same top weight", () => {
    const [p] = detectPRs(prior, [s("Squat", 200, 8)]);
    expect(p).toMatchObject({ kind: "e1rm", exercise: "Squat" });
  });
  it("is not a PR the first time, when skipped, or when not better", () => {
    expect(detectPRs(prior, [s("Curl", 30, 10)])).toEqual([]);
    expect(detectPRs(prior, [s("Bench", 300, 5, null, true)])).toEqual([]);
    expect(detectPRs(prior, [s("Bench", 135, 5)])).toEqual([]);
  });
});

describe("nextWeights", () => {
  it("goes up when every top set hit the target and wasn't a grind", () => {
    const [n] = nextWeights([s("Bench press", 135, 8, 7), s("Bench press", 135, 8, 8)], { "Bench press": 8 });
    expect(n).toMatchObject({ action: "up", to: 140 });
  });
  it("adds more for lower body and less for light dumbbells", () => {
    expect(nextWeights([s("Back squat", 185, 5)], { "Back squat": 5 })[0].to).toBe(195);
    expect(nextWeights([s("DB curl", 20, 10)], { "DB curl": 10 })[0].to).toBe(22.5);
  });
  it("holds when it was a grind or close, drops when well short", () => {
    expect(nextWeights([s("Press", 95, 5, 9.5)], { Press: 5 })[0].action).toBe("same");
    expect(nextWeights([s("Press", 95, 4)], { Press: 5 })[0].action).toBe("same");
    const down = nextWeights([s("Press", 100, 2), s("Press", 100, 3)], { Press: 6 })[0];
    expect(down).toMatchObject({ action: "down", to: 95 });
  });
  it("says nothing without a target or weight", () => {
    expect(nextWeights([s("Plank", null, 45)], { Plank: 45 })).toEqual([]);
    expect(nextWeights([s("Press", 95, 5)], {})).toEqual([]);
  });
});

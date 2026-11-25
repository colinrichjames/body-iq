import { describe, expect, it } from "vitest";
import { countSets, recap, skipExerciseLogs, skippedLog } from "./player";
import { buildSteps } from "./steps";
import type { Workout } from "./types";

const workout = (structure: Workout["structure"]) => ({ structure }) as unknown as Workout;

describe("skipping", () => {
  const steps = buildSteps(workout({ exercises: [{ name: "Bench", sets: 3, reps: 8 }, { name: "Fly", sets: 2, reps: 12 }] }));
  it("skips one set as an explicit skipped entry", () => {
    expect(skippedLog(steps[0])).toEqual({ exercise: "Bench", set_number: 1, reps: null, weight_lb: null, rpe: null, skipped: true });
  });
  it("skipping an exercise skips its remaining sets only", () => {
    const logs = skipExerciseLogs(steps, 1);
    expect(logs.map((l) => `${l.exercise}${l.set_number}`)).toEqual(["Bench2", "Bench3"]);
    expect(logs.every((l) => l.skipped)).toBe(true);
  });
  it("returns nothing past the end", () => {
    expect(skipExerciseLogs(steps, 99)).toEqual([]);
  });
});

describe("recap", () => {
  const logs = [
    { exercise: "Bench", set_number: 1, reps: 8, weight_lb: 135, rpe: 8 },
    { exercise: "Bench", set_number: 2, reps: null, weight_lb: null, skipped: true },
    { exercise: "Fly", set_number: 1, reps: 12, weight_lb: null },
  ];
  it("lists skipped sets as skipped instead of dropping them", () => {
    const r = recap(logs);
    expect(r[0]).toEqual({ exercise: "Bench", done: 1, skipped: 1, lines: ["135 × 8 @8", "skipped"] });
    expect(r[1].lines).toEqual(["12"]);
  });
  it("counts done and skipped separately", () => {
    expect(countSets(logs)).toEqual({ done: 2, skipped: 1 });
  });
});

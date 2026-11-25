import { describe, expect, it } from "vitest";
import { applyOrder, moveExercise, queueOverview, stepKey } from "./queue";
import { buildSteps } from "./steps";
import type { Workout } from "./types";

const w = { structure: { exercises: [{ name: "A", sets: 2, reps: 5 }, { name: "B", sets: 2, reps: 5 }, { name: "C", sets: 1, reps: 5 }], rest_sec: 60 } } as unknown as Workout;
const names = (s: { exercise: string; setNumber: number }[]) => s.map((x) => `${x.exercise}${x.setNumber}`).join(" ");

describe("moveExercise", () => {
  const steps = buildSteps(w);
  it("moves an exercise to the back, keeping finished sets in place", () => {
    expect(names(moveExercise(steps, 0, "A", "later"))).toBe("B1 B2 C1 A1 A2");
    expect(names(moveExercise(steps, 1, "A", "later"))).toBe("A1 B1 B2 C1 A2");
  });
  it("moves an exercise to the front", () => {
    expect(names(moveExercise(steps, 0, "C", "next"))).toBe("C1 A1 A2 B1 B2");
  });
  it("does nothing when it is the only exercise left", () => {
    const left = steps.slice(0, 4);
    expect(moveExercise(steps.slice(3), 0, "C", "later")).toEqual(steps.slice(3));
    expect(left).toHaveLength(4);
  });
  it("fixes rest: set rest within an exercise, longer rest when switching, none at the very end", () => {
    const moved = moveExercise(steps, 0, "A", "later");
    expect(moved.map((s) => s.restAfter)).toEqual([60, 120, 120, 60, 0]);
  });
});

describe("applyOrder", () => {
  const steps = buildSteps(w);
  it("restores a saved order and puts unknown sets last", () => {
    const keys = moveExercise(steps, 0, "B", "next").map(stepKey);
    expect(names(applyOrder(steps, keys))).toBe("B1 B2 A1 A2 C1");
    expect(names(applyOrder(steps, ["C#1", "gone#1"]))).toBe("C1 A1 A2 B1 B2");
  });
  it("returns the plan unchanged without an order", () => {
    expect(applyOrder(steps, null)).toBe(steps);
  });
});

describe("queueOverview", () => {
  it("lists what is left first and counts done and skipped sets", () => {
    const steps = moveExercise(buildSteps(w), 0, "B", "next");
    const logs = [
      { exercise: "B", set_number: 1, reps: 5, weight_lb: null },
      { exercise: "B", set_number: 2, reps: null, weight_lb: null, skipped: true },
    ];
    const q = queueOverview(steps, logs, 2);
    expect(q.map((i) => `${i.name}:${i.done}/${i.total}${i.finished ? "F" : ""}${i.current ? "*" : ""}`)).toEqual(["A:0/2*", "C:0/1", "B:1/2F"]);
    expect(q[2].skipped).toBe(1);
  });
});

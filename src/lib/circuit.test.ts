import { describe, expect, it } from "vitest";
import { parseCircuit } from "./circuit";
import { buildSteps } from "./steps";
import type { Workout } from "./types";

const original = { name: "Round x3", detail: "SkiErg 350 m, Sled push 15 m x2, Burpee broad jumps 25 m, Row 350 m, Farmers carry 70 m, Wall balls 20. Rest 90 s between rounds." };
const gym = { name: "Round x3", detail: "Straight-arm cable pulldowns 35 reps, steady, Heavy leg press 8 reps, heavy x2, Burpee broad jumps 25 m, Row 350 m, Farmers carry 70 m, Dumbbell thrusters 20 reps. Rest 90 s between rounds." };

describe("parseCircuit", () => {
  it("reads the original station block", () => {
    const c = parseCircuit({ ...original })!;
    expect(c.rounds).toBe(3);
    expect(c.restSec).toBe(90);
    expect(c.exercises.map((e) => [e.name, e.sets, e.reps, e.unit ?? null])).toEqual([
      ["SkiErg", 3, 350, "m"],
      ["Sled push", 6, 15, "m"],
      ["Burpee broad jumps", 3, 25, "m"],
      ["Row", 3, 350, "m"],
      ["Farmers carry", 3, 70, "m"],
      ["Wall balls", 3, 20, null],
    ]);
  });
  it("reads the gym version, keeping cues as notes and 'x2' as double sets", () => {
    const c = parseCircuit({ ...gym })!;
    expect(c.exercises.map((e) => e.name)).toEqual(["Straight-arm cable pulldowns", "Heavy leg press", "Burpee broad jumps", "Row", "Farmers carry", "Dumbbell thrusters"]);
    expect(c.exercises[0]).toMatchObject({ reps: 35, sets: 3, note: "steady" });
    expect(c.exercises[1]).toMatchObject({ reps: 8, sets: 6, note: "heavy" });
    expect(c.exercises[5]).toMatchObject({ reps: 20, sets: 3 });
  });
  it("ignores blocks that are not a Round list", () => {
    expect(parseCircuit({ name: "Warm-up", detail: "5 min easy" })).toBeNull();
  });
});

describe("buildSteps for a station session", () => {
  const w = { structure: { blocks: [{ name: "Warm-up", detail: "easy" }, gym, { name: "Cool-down", detail: "walk" }] } } as unknown as Workout;
  it("gives every station its own sets", () => {
    const steps = buildSteps(w);
    expect(steps.filter((s) => s.exercise === "Farmers carry").map((s) => `${s.setNumber}/${s.totalSets}`)).toEqual(["1/3", "2/3", "3/3"]);
    expect(steps).toHaveLength(3 + 6 + 3 + 3 + 3 + 3);
    expect(steps.at(-1)!.restAfter).toBe(0);
  });
  it("turns circuit rounds into straight sets", () => {
    const c = { structure: { rounds: 3, exercises: [{ name: "A", reps: 10 }, { name: "B", reps: 10 }] } } as unknown as Workout;
    expect(buildSteps(c).map((s) => `${s.exercise}${s.setNumber}`)).toEqual(["A1", "A2", "A3", "B1", "B2", "B3"]);
  });
});

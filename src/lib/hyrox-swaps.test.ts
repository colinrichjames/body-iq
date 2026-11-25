import { describe, expect, it } from "vitest";
import { isSwapped, revertStructure, stationsIn, swapStructure, swapText } from "./hyrox-swaps";
import type { WorkoutStructure } from "./types";

const stationSkills: WorkoutStructure = {
  blocks: [
    { name: "Warm-up", detail: "5 min row or ski easy, then dynamic mobility.", minutes: 10 },
    { name: "Round x3", detail: "SkiErg 350 m, Sled push 15 m x2, Burpee broad jumps 25 m, Row 350 m, Farmers carry 70 m, Wall balls 20. Rest 90 s between rounds.", minutes: 35 },
  ],
};
const sim: WorkoutStructure = { blocks: [{ name: "Run 1", detail: "1 km at target race pace." }, { name: "Sled push", detail: "50 m" }, { name: "Wall balls", detail: "100 reps" }] };

describe("swapText", () => {
  it("converts station amounts and leaves gym-ready work alone", () => {
    const t = swapText(stationSkills.blocks![1].detail);
    expect(t).toContain("Straight-arm cable pulldowns 35 reps, steady");
    expect(t).toContain("Heavy leg press 8 reps, heavy x2");
    expect(t).toContain("Dumbbell thrusters 20 reps");
    expect(t).toContain("Burpee broad jumps 25 m");
    expect(t).toContain("Row 350 m");
    expect(t).toContain("Farmers carry 70 m");
    expect(t).not.toMatch(/SkiErg|Sled push|Wall balls/);
  });
});

describe("swap and revert", () => {
  it("swaps a station block by name and keeps the original", () => {
    const s = swapStructure(sim);
    expect(s.blocks![1]).toMatchObject({ name: "Heavy leg press", original: { name: "Sled push", detail: "50 m" } });
    expect(s.blocks![1].detail).toContain("25 reps");
    expect(s.blocks![0]).toBe(sim.blocks![0]);
    expect(isSwapped(s)).toBe(true);
  });
  it("is reversible and idempotent", () => {
    const once = swapStructure(sim);
    expect(swapStructure(once)).toEqual(once);
    expect(revertStructure(once)).toEqual(sim);
    expect(isSwapped(revertStructure(once))).toBe(false);
  });
  it("lists the special stations in a session, even after swapping", () => {
    expect(stationsIn(sim).map((s) => s.id)).toEqual(["sled_push", "wall_balls"]);
    expect(stationsIn(swapStructure(sim)).map((s) => s.id)).toEqual(["sled_push", "wall_balls"]);
    expect(stationsIn({ blocks: [{ name: "Run", detail: "5 km" }] })).toEqual([]);
  });
});

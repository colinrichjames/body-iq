import { describe, expect, it } from "vitest";
import { isStale, isSwapped, revertStructure, stationsIn, swapStructure, swapText } from "./hyrox-swaps";
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
    expect(t).toContain("Standard burpees 10 reps");
    expect(t).toContain("Dumbbell shoulder raises 15 reps");
    expect(t).toContain("Row 350 m");
    expect(t).not.toMatch(/SkiErg|Sled push|Wall balls|Burpee broad|Farmers carry/);
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

describe("farmers carry and burpee broad jumps", () => {
  const sim2: WorkoutStructure = { blocks: [{ name: "Burpee Broad Jumps", detail: "80 m" }, { name: "Farmers Carry", detail: "200 m" }] };
  it("become standard burpees and dumbbell shoulder raises as station blocks", () => {
    const s = swapStructure(sim2);
    expect(s.blocks!.map((b) => b.name)).toEqual(["Standard burpees", "Dumbbell shoulder raises"]);
    expect(s.blocks![0].detail).toContain("30 reps");
    expect(s.blocks![1].detail).toContain("40 reps");
    expect(revertStructure(s)).toEqual(sim2);
  });
  it("refreshes a session that was swapped before these were added", () => {
    const old: WorkoutStructure = { blocks: [{ name: "Round x3", detail: "Straight-arm cable pulldowns 35 reps, steady, Burpee broad jumps 25 m, Farmers carry 70 m. Rest 90 s between rounds.", original: { name: "Round x3", detail: "SkiErg 350 m, Burpee broad jumps 25 m, Farmers carry 70 m. Rest 90 s between rounds." } }] };
    expect(isStale(old)).toBe(true);
    const fresh = swapStructure(old);
    expect(fresh.blocks![0].detail).toContain("Standard burpees 10 reps, Dumbbell shoulder raises 15 reps");
    expect(fresh.blocks![0].original?.detail).toContain("Farmers carry 70 m");
    expect(isStale(fresh)).toBe(false);
    expect(revertStructure(fresh).blocks![0].detail).toContain("SkiErg 350 m");
  });
});

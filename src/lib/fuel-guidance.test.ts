import { describe, expect, it } from "vitest";
import { fuelGuidance } from "./fuel-guidance";

const perKg = { carbsPerKg: [5, 6] as [number, number], proteinPerKg: [1.6, 2] as [number, number], carbsG: [408, 490] as [number, number], proteinG: [130, 163] as [number, number] };
const none = { calories: null, protein: null, carbs: null, fat: null };

describe("fuelGuidance", () => {
  it("uses the user's own targets, never the g/kg range, when targets are set", () => {
    const g = fuelGuidance({ calories: 2200, protein: 160, carbs: 220, fat: 70 }, null, perKg);
    expect(g.kind).toBe("targets");
    expect(g.lines.join(" ")).toContain("220 g carbs");
    expect(g.lines.join(" ")).not.toMatch(/g\/kg|408|490/);
  });
  it("shows how today compares with the targets", () => {
    const g = fuelGuidance({ calories: 2200, protein: 160, carbs: 220, fat: 70 }, { calories: 997, protein: 61, carbs: 130 }, perKg);
    expect(g.lines[1]).toBe("So far: carbs 130 of 220 g (59%), protein 61 of 160 g (38%).");
  });
  it("shows only the targets that exist", () => {
    const g = fuelGuidance({ ...none, calories: 2000 }, null, perKg);
    expect(g.kind).toBe("targets");
    expect(g.lines[0]).toBe("Your targets for today: 2,000 cal.");
  });
  it("falls back to the labelled general guideline when no targets are set", () => {
    const g = fuelGuidance(none, null, perKg);
    expect(g.kind).toBe("guideline");
    expect(g.lines[0]).toMatch(/^General guideline, not your target/);
    expect(g.lines[0]).toContain("5-6 g/kg (about 408-490 g)");
  });
  it("tells the user to log a scan when there is no weight for grams", () => {
    expect(fuelGuidance(none, null, { ...perKg, carbsG: null, proteinG: null }).lines[0]).toContain("log a body scan");
  });
});

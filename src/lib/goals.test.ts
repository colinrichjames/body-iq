import { describe, expect, it } from "vitest";
import { GOALS, GOAL_TYPES, goalOf, goalPlan } from "./goals";

describe("goals", () => {
  it("every goal maps to a coach direction consistent with its pace", () => {
    for (const t of GOAL_TYPES) {
      const g = GOALS[t];
      if (g.mode === "maintain") expect(g.rate).toBeNull();
      else expect(g.rate).toBeGreaterThan(0);
    }
    expect(GOALS.lose_fat.mode).toBe("lose");
    expect(GOALS.build_muscle.mode).toBe("gain");
  });
  it("falls back to the old lose/maintain/gain setting", () => {
    expect(goalOf(null)).toBeNull();
    expect(goalOf({ goal_type: null, goal_mode: "lose" })).toBe("lose_weight");
    expect(goalOf({ goal_type: null, goal_mode: "gain" })).toBe("gain_weight");
    expect(goalOf({ goal_type: "lose_fat", goal_mode: "lose" })).toBe("lose_fat");
    expect(goalOf({ goal_type: null, goal_mode: null })).toBeNull();
  });
  it("turns protein per kg into grams and flags a low target", () => {
    const plan = goalPlan("build_muscle", 180, 100);
    expect(plan.tips[0]).toBe("Protein: aim for 131-180 g a day.");
    expect(plan.tips.some((t) => t.includes("below that range"))).toBe(true);
    expect(goalPlan("maintain", 180, 160).tips.some((t) => t.includes("below"))).toBe(false);
    expect(goalPlan("maintain", null, null).tips[0]).toContain("per kg");
  });
});

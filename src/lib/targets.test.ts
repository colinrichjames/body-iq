import { describe, expect, it } from "vitest";
import { macroCalories, macroMismatch, remainingText } from "./targets";

describe("macroCalories", () => {
  it("uses 4/4/9", () => {
    expect(macroCalories(180, 300, 70)).toBe(2550);
    expect(macroCalories(180, null, 70)).toBeNull();
  });
});

describe("macroMismatch", () => {
  it("is quiet when macros roughly match calories", () => {
    expect(macroMismatch({ calories: 2500, protein: 180, carbs: 300, fat: 65 })).toBeNull();
  });
  it("explains a real gap in plain words", () => {
    expect(macroMismatch({ calories: 2000, protein: 180, carbs: 300, fat: 70 })).toBe("Your protein, carbs and fat add up to 2,550 calories, 550 more than the 2,000 target.");
    expect(macroMismatch({ calories: 3000, protein: 150, carbs: 200, fat: 60 })).toContain("fewer than the 3,000 target");
  });
  it("says nothing when a target is missing", () => {
    expect(macroMismatch({ calories: null, protein: 180, carbs: 300, fat: 70 })).toBeNull();
    expect(macroMismatch({ calories: 2500, protein: 180, carbs: null, fat: 70 })).toBeNull();
  });
});

describe("remainingText", () => {
  it("says left or over", () => {
    expect(remainingText(2500, 2180)).toBe("320 left");
    expect(remainingText(180, 205, " g")).toBe("25 g over");
    expect(remainingText(2500, 2500)).toBe("0 left");
  });
});

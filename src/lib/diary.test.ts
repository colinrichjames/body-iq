import { describe, expect, it } from "vitest";
import { fillPct, isDiaryMeal, mealSummary, sundayWeek } from "./diary";

describe("sundayWeek", () => {
  it("runs Sunday to Saturday around the day", () => {
    // 2026-11-25 is a Wednesday
    expect(sundayWeek("2026-11-25")).toEqual(["2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"]);
  });
  it("puts Sunday first and Saturday last", () => {
    expect(sundayWeek("2026-11-22")[0]).toBe("2026-11-22");
    expect(sundayWeek("2026-11-28")[0]).toBe("2026-11-22");
    expect(sundayWeek("2026-11-29")[0]).toBe("2026-11-29");
  });
});

describe("mealSummary", () => {
  it("names one, two or many", () => {
    expect(mealSummary([])).toBe("");
    expect(mealSummary(["Protein Bar"])).toBe("Protein Bar");
    expect(mealSummary(["Eggs", "Toast"])).toBe("Eggs and Toast");
    expect(mealSummary(["Protein Bar", "Banana", "Coffee"])).toBe("Protein Bar and 2 more");
  });
  it("counts a repeated food once", () => {
    expect(mealSummary(["Eggs", "Eggs", "Toast"])).toBe("Eggs and Toast");
  });
});

describe("fillPct", () => {
  it("clamps and handles no target", () => {
    expect(fillPct(50, 200)).toBe(25);
    expect(fillPct(300, 200)).toBe(100);
    expect(fillPct(10, null)).toBe(0);
    expect(fillPct(10, 0)).toBe(0);
    expect(fillPct(-5, 100)).toBe(0);
  });
});

describe("isDiaryMeal", () => {
  it("accepts the four meals only", () => {
    expect(isDiaryMeal("lunch")).toBe(true);
    expect(isDiaryMeal("other")).toBe(false);
    expect(isDiaryMeal(undefined)).toBe(false);
  });
});

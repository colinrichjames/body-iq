import { describe, expect, it } from "vitest";
import { pickedToExercises, quickTitle, recentNames } from "./quick-start";

describe("quick start helpers", () => {
  it("titles by time of day", () => {
    expect(quickTitle(6)).toBe("Morning Workout");
    expect(quickTitle(12)).toBe("Afternoon Workout");
    expect(quickTitle(16)).toBe("Afternoon Workout");
    expect(quickTitle(17)).toBe("Evening Workout");
    expect(quickTitle(NaN)).toBe("Afternoon Workout");
  });
  it("dedupes recent names ignoring case and caps the list", () => {
    expect(recentNames([{ exercise: "Squat" }, { exercise: "squat" }, { exercise: " Bench " }, { exercise: "" }])).toEqual(["Squat", "Bench"]);
    expect(recentNames(Array.from({ length: 30 }, (_, i) => ({ exercise: `E${i}` })), 5)).toHaveLength(5);
  });
  it("defaults to 3x10 and drops blanks and duplicates", () => {
    expect(pickedToExercises([{ name: "Squat" }, { name: "squat", sets: 5 }, { name: " " }, { name: "Row", sets: 4, reps: 8 }])).toEqual([
      { name: "Squat", sets: 3, reps: 10 },
      { name: "Row", sets: 4, reps: 8 },
    ]);
  });
});

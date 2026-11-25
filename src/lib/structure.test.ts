import { describe, expect, it } from "vitest";
import { exercisesFromForm, formatExercises, looksMerged, parseExercises, sanitizeExercises } from "./structure";

const expected = [
  { name: "Back squat", sets: 4, reps: 6, weight_lb: 135 },
  { name: "Pull-ups", sets: 3, reps: 8 },
  { name: "Plank", sets: 3, seconds: 45 },
];

describe("parseExercises", () => {
  it("parses three lines into three exercises", () => {
    expect(parseExercises("Back squat 4x6 @ 135\nPull-ups 3x8\nPlank 3x45s")).toEqual(expected);
  });
  it("handles Windows and old-Mac line endings", () => {
    expect(parseExercises("Back squat 4x6 @ 135\r\nPull-ups 3x8\r\nPlank 3x45s")).toEqual(expected);
    expect(parseExercises("Back squat 4x6 @ 135\rPull-ups 3x8\rPlank 3x45s")).toEqual(expected);
  });
  it("recovers lines that were joined with no separator (the reported bug)", () => {
    expect(parseExercises("Back squat 4x6 @ 135Pull-ups 3x8Plank 3x45s")).toEqual(expected);
  });
  it("recovers lines joined with spaces", () => {
    expect(parseExercises("Back squat 4x6 @ 135 Pull-ups 3x8 Plank 3x45s")).toEqual(expected);
  });
  it("does not read the s of the next word as seconds", () => {
    expect(parseExercises("Pull-ups 3x8Squats 4x5")).toEqual([
      { name: "Pull-ups", sets: 3, reps: 8 },
      { name: "Squats", sets: 4, reps: 5 },
    ]);
  });
  it("keeps a bare name and ignores blank lines", () => {
    expect(parseExercises("Farmers carry\n\n  \nPlank 2x30s")).toEqual([{ name: "Farmers carry" }, { name: "Plank", sets: 2, seconds: 30 }]);
  });
  it("round-trips through formatExercises", () => {
    expect(parseExercises(formatExercises(expected))).toEqual(expected);
  });
});

describe("form handling", () => {
  it("prefers the row editor's JSON", () => {
    const fd = new FormData();
    fd.set("exercises_json", JSON.stringify([{ name: "Back squat", sets: 4, reps: 6, weight_lb: 135 }, { name: "Plank", sets: 3, seconds: 45 }, { name: "  " }]));
    fd.set("exercises", "ignored 1x1");
    expect(exercisesFromForm(fd)).toEqual([
      { name: "Back squat", sets: 4, reps: 6, weight_lb: 135 },
      { name: "Plank", sets: 3, seconds: 45 },
    ]);
  });
  it("falls back to text when the JSON is bad", () => {
    const fd = new FormData();
    fd.set("exercises_json", "{nope");
    fd.set("exercises", "Pull-ups 3x8");
    expect(exercisesFromForm(fd)).toEqual([{ name: "Pull-ups", sets: 3, reps: 8 }]);
  });
  it("sanitizes junk values", () => {
    expect(sanitizeExercises([{ name: "X", sets: -2, reps: "abc", weight_lb: 1e9 }, 5, null])).toEqual([{ name: "X" }]);
    expect(sanitizeExercises("nope")).toEqual([]);
  });
});

describe("looksMerged", () => {
  it("flags a glued-together name but not a normal one", () => {
    expect(looksMerged("Back squat 4x6 @ 135Pull-ups 3x8Plank")).toBe(true);
    expect(looksMerged("Back squat")).toBe(false);
    expect(looksMerged("Dumbbell fly")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { deloadCheck, loadStep, setE1RM, suggestNext, working, type HistSession } from "./progression";
import { groupHistory } from "./progression-data";

const sess = (date: string, weight: number, reps: number[], rpe: number | null = null): HistSession => ({ date, sets: reps.map((r) => ({ weight, reps: r, rpe })) });

describe("suggestNext with RPE", () => {
  it("goes up when reps and RPE show room", () => {
    const s = suggestNext("Bench press", [sess("2026-11-20", 100, [8, 8, 8], 6)], 8)!;
    expect(s).toMatchObject({ action: "up", weight: 105, from: 100 });
  });
  it("holds when the effort was right on target", () => {
    expect(suggestNext("Bench press", [sess("2026-11-20", 100, [8, 8, 8], 8)], 8)).toMatchObject({ action: "hold", weight: 100 });
  });
  it("does not chase half a step", () => {
    expect(suggestNext("Bench press", [sess("2026-11-20", 100, [8, 8, 8], 7)], 8)).toMatchObject({ action: "hold", weight: 100 });
  });
  it("drops when sets were missed at a grinding effort", () => {
    const s = suggestNext("Bench press", [sess("2026-11-20", 100, [6, 6, 5], 9.5)], 8)!;
    expect(s).toMatchObject({ action: "down", weight: 90 });
  });
  it("never goes up after a grind, even with every rep hit", () => {
    expect(suggestNext("Bench press", [sess("2026-11-20", 100, [8, 8, 8], 9.5)], 8)!.action).not.toBe("up");
  });
  it("caps the jump at two steps and uses 10 lb steps for lower body", () => {
    const s = suggestNext("Back squat", [sess("2026-11-20", 200, [5, 5, 5], 6)], 5)!;
    expect(s).toMatchObject({ action: "up", weight: 210 });
    expect(suggestNext("Bench press", [sess("2026-11-20", 100, [10, 10, 10], 6)], 5)!.weight).toBe(110);
  });
});

describe("suggestNext without RPE", () => {
  it("goes up a step when every set hits the target", () => {
    expect(suggestNext("Bench press", [sess("2026-11-20", 100, [8, 8, 9])], 8)).toMatchObject({ action: "up", weight: 105 });
  });
  it("uses 2.5 lb jumps for light dumbbells", () => {
    expect(suggestNext("Dumbbell curl", [sess("2026-11-20", 25, [10, 10, 10])], 10)!.weight).toBe(27.5);
  });
  it("drops about 7.5% after a big miss and holds after a near miss", () => {
    expect(suggestNext("Bench press", [sess("2026-11-20", 100, [5, 5, 5])], 8)).toMatchObject({ action: "down", weight: 95 });
    expect(suggestNext("Bench press", [sess("2026-11-20", 100, [7, 8, 8])], 8)).toMatchObject({ action: "hold", weight: 100 });
  });
  it("returns nothing without history", () => {
    expect(suggestNext("Bench press", [], 8)).toBeNull();
    expect(suggestNext("Bench press", [{ date: "2026-11-20", sets: [] }], 8)).toBeNull();
  });
  it("uses the weight of most sets as the working weight", () => {
    const sets = [{ weight: 100, reps: 8, rpe: null }, { weight: 100, reps: 8, rpe: null }, { weight: 105, reps: 5, rpe: null }];
    expect(working(sets)!.weight).toBe(100);
  });
});

describe("deload week", () => {
  it("takes about 10% off", () => {
    expect(suggestNext("Bench press", [sess("2026-11-20", 100, [8, 8, 8], 8)], 8, { deload: true })).toMatchObject({ action: "deload", weight: 90 });
    expect(suggestNext("Back squat", [sess("2026-11-20", 225, [5, 5, 5])], 5, { deload: true })!.weight).toBe(200);
  });
});

describe("deloadCheck", () => {
  const slipping = (n: number): HistSession[] => [sess("2026-11-20", 90, [8, 8, 8]), sess("2026-11-17", 90, [8, 8, 8]), sess("2026-11-13", 100, [8, 8, 8]), sess("2026-11-10", 100, [8, 8, 8]), sess("2026-11-06", 100, [8, 8, 8])].slice(0, n);
  it("is none when strength is steady", () => {
    const steady = [sess("2026-11-20", 100, [8, 8, 8]), sess("2026-11-17", 100, [8, 8, 8]), sess("2026-11-13", 100, [8, 8, 8])];
    expect(deloadCheck({ Bench: steady }).level).toBe("none");
  });
  it("is none without three sessions of history", () => {
    expect(deloadCheck({ Bench: slipping(2) }).level).toBe("none");
  });
  it("watches one slipping lift and deloads two", () => {
    expect(deloadCheck({ Bench: slipping(5) })).toMatchObject({ level: "watch", exercises: ["Bench"] });
    const two = deloadCheck({ Bench: slipping(5), Row: slipping(5) });
    expect(two.level).toBe("deload");
    expect(two.reasons[0]).toMatch(/slipping on Bench, Row/);
  });
  it("flags two sessions in a row at RPE 9 or higher", () => {
    const hard = [sess("2026-11-20", 100, [8, 8], 9.5), sess("2026-11-17", 100, [8, 8], 9), sess("2026-11-13", 100, [8, 8], 8)];
    expect(deloadCheck({ Bench: hard }).reasons[0]).toMatch(/average RPE 9 or higher/);
  });
  it("poor recovery alone is a watch, with a flagged lift it is a deload", () => {
    expect(deloadCheck({}, 5).level).toBe("watch");
    expect(deloadCheck({ Bench: slipping(5) }, 5).level).toBe("deload");
    expect(deloadCheck({}, 3).level).toBe("none");
  });
});

describe("helpers", () => {
  it("counts reps in reserve in the max estimate", () => {
    expect(setE1RM({ weight: 100, reps: 8, rpe: 8 })).toBe(133.3);
    expect(setE1RM({ weight: 100, reps: 12, rpe: 6 })).toBe(140);
    expect(setE1RM({ weight: 0, reps: 8, rpe: 8 })).toBeNull();
  });
  it("picks load steps", () => {
    expect(loadStep("Dumbbell fly", 20)).toBe(2.5);
    expect(loadStep("Dumbbell press", 50)).toBe(5);
    expect(loadStep("Leg press", 200)).toBe(10);
  });
  it("groups rows into sessions by day, newest first, dropping skipped and unweighted sets", () => {
    const rows = [
      { exercise: "Bench", weight_lb: "100.0", reps: 8, rpe: "8.0", skipped: false, workouts: { workout_date: "2026-11-10" } },
      { exercise: "Bench", weight_lb: 105, reps: 6, rpe: null, skipped: false, workouts: [{ workout_date: "2026-11-17" }] },
      { exercise: "Bench", weight_lb: null, reps: 8, rpe: null, skipped: false, workouts: { workout_date: "2026-11-17" } },
      { exercise: "Bench", weight_lb: 105, reps: null, rpe: null, skipped: true, workouts: { workout_date: "2026-11-17" } },
    ];
    const g = groupHistory(rows);
    expect(g.Bench.map((s) => s.date)).toEqual(["2026-11-17", "2026-11-10"]);
    expect(g.Bench[0].sets).toEqual([{ weight: 105, reps: 6, rpe: null }]);
    expect(g.Bench[1].sets[0].rpe).toBe(8);
  });
});

import { describe, expect, it } from "vitest";
import { bodyWeightReply, findExercise, fuelReply, lastLiftReply, nextLiftReply, parseIntent, raceReply, readinessReply, scoreReply, sessionReply, todayReply } from "./coach-chat";
import type { BodyScan, Race, Workout } from "./types";

const w = (over: Partial<Workout>) => ({ id: "w1", title: "Tempo run", sport: "run", status: "planned", workout_date: "2026-11-26", planned_duration_min: 40, actual_duration_min: null, ...over }) as Workout;

describe("parseIntent", () => {
  const kind = (s: string) => parseIntent(s).kind;
  it("routes the questions the coach can answer", () => {
    expect(kind("What's my workout today?")).toBe("today");
    expect(kind("how am I doing on calories")).toBe("fuel");
    expect(kind("What did I squat last time?")).toBe("lift_last");
    expect(kind("Why did my weight change?")).toBe("body_weight");
    expect(kind("why is my back squat going up next time")).toBe("lift_next");
    expect(kind("break down my body iq score")).toBe("score");
    expect(kind("am I ready to train hard")).toBe("readiness");
    expect(kind("when is my race")).toBe("race");
    expect(kind("Tell me about this session")).toBe("session");
    expect(kind("help")).toBe("help");
  });
  it("doesn't pretend to understand anything else", () => {
    expect(kind("write me a poem about autumn")).toBe("unknown");
    expect(kind("")).toBe("help");
  });
});

describe("findExercise", () => {
  const names = ["Back Squat", "Bench Press", "Romanian Deadlift"];
  it("matches loosely, and returns null when nothing matches", () => {
    expect(findExercise("squat", names)).toBe("Back Squat");
    expect(findExercise("bench", names)).toBe("Bench Press");
    expect(findExercise("deadlifts", names)).toBe("Romanian Deadlift");
    expect(findExercise("snatch", names)).toBeNull();
    expect(findExercise(null, names)).toBeNull();
  });
});

describe("replies are built from the data and say so when it is missing", () => {
  it("today", () => {
    expect(todayReply("2026-11-26", [], null).text).toMatch(/Nothing is planned/);
    const r = todayReply("2026-11-26", [w({})], null);
    expect(r.lines?.[0]).toContain("Tempo run, 40 min (planned)");
    expect(todayReply("2026-11-26", [w({ status: "skipped" })], null).text).toMatch(/skipped/);
  });
  it("fuel: real totals vs targets, and no invented totals when nothing is logged", () => {
    const t = { calories: 2200, protein: 160, carbs: null, fat: null };
    expect(fuelReply("today", { calories: 1550, protein: 90, carbs: 100, fat: 40 }, t).lines).toContain("Calories: 1550 of 2200 (650 left)");
    const none = fuelReply("today", null, t);
    expect(none.text).toMatch(/Nothing is logged/);
    expect(JSON.stringify(none)).not.toMatch(/1550/);
  });
  it("last lift", () => {
    const r = lastLiftReply("Back Squat", "squat", [{ date: "2026-11-24", sets: [{ weight: 135, reps: 10, rpe: 8, skipped: false }, { weight: 135, reps: 8, rpe: null, skipped: false }, { weight: 135, reps: null, rpe: null, skipped: true }] }]);
    expect(r.lines?.[0]).toBe("135 lb × 10 @8, 135 lb × 8");
    expect(r.lines?.[1]).toBe("1 set skipped.");
    expect(lastLiftReply(null, "snatch", []).text).toMatch(/don't have any logged sets matching "snatch"/);
    expect(lastLiftReply("Back Squat", null, []).text).toMatch(/don't have any finished sets/);
  });
  it("next lift gives the engine's reason, or admits there isn't enough data", () => {
    const sug = { exercise: "Back Squat", weight: 130, from: 120, reps: 10, action: "up" as const, reason: "Hit 10 reps on every set." };
    expect(nextLiftReply("Back Squat", null, sug, 10).text).toBe("Back Squat: up from 120 lb to 130 lb.");
    expect(nextLiftReply("Back Squat", null, null, null).text).toMatch(/enough finished, weighted sets/);
  });
  it("body weight: two scans give a real difference, one scan gives no comparison, none says so", () => {
    const scan = (id: string, day: string, wt: number) => ({ id, scanned_at: day, weight_lb: wt }) as unknown as BodyScan;
    const opts = { trendWeight: null, ratePerWeek: null, avgCalories: null, targetCalories: null, loggedDays: 0 };
    expect(bodyWeightReply([scan("a", "2026-11-25", 180), scan("b", "2026-11-18", 182)], opts).lines?.[0]).toContain("(-2 lb)");
    expect(bodyWeightReply([scan("a", "2026-11-25", 180)], opts).lines?.[0]).toMatch(/nothing to compare/);
    expect(bodyWeightReply([], opts).text).toMatch(/don't have any weight logged/);
  });
  it("score", () => {
    const cats = [{ key: "nutrition", label: "Nutrition", max: 20, score: 14, note: "ok", missing: null, rule: "" }, { key: "training", label: "Training", max: 25, score: null, note: "", missing: "a session", rule: "" }] as never;
    expect(scoreReply(null, 1, cats).text).toMatch(/needs 3 of 5/);
    expect(scoreReply(72, 4, cats).text).toContain("72 (provisional)");
  });
  it("readiness, race and session", () => {
    expect(readinessReply(null, null).text).toMatch(/don't have any sleep/);
    expect(raceReply(null, "2026-11-26", null).text).toMatch(/don't have an upcoming race/);
    const race = { id: "r1", name: "Test HYROX", race_date: "2026-12-06", goal_time_sec: null } as Race;
    expect(raceReply(race, "2026-11-26", null).text).toContain("in 10 days");
    expect(sessionReply(null, []).text).toMatch(/Ask coach there/);
    expect(sessionReply(w({ status: "completed", actual_duration_min: 31 }), [{ exercise: "x", weight: null, reps: 5, skipped: false }]).lines).toContain("1 set logged.");
  });
});

import { describe, expect, it } from "vitest";
import { exerciseOverview, hyroxBlockTargets, isDumbbell, restSummary } from "./context";
import { buildSteps } from "./steps";
import type { Workout } from "./types";

const w = { structure: { exercises: [{ name: "Bench", sets: 2, reps: 8 }, { name: "Dumbbell Fly", sets: 3, reps: 12 }, { name: "Plank", sets: 1, seconds: 45 }] } } as unknown as Workout;

describe("player context", () => {
  it("knows exercise position and set progress", () => {
    const steps = buildSteps(w);
    const o = exerciseOverview(steps, 2);
    expect(o.position).toBe(2);
    expect(o.list.map((x) => `${x.name} ${x.setsDone}/${x.totalSets}`)).toEqual(["Bench 2/2", "Dumbbell Fly 0/3", "Plank 0/1"]);
  });
  it("detects dumbbell lifts", () => {
    expect(isDumbbell("Dumbbell Fly")).toBe(true);
    expect(isDumbbell("DB Row")).toBe(true);
    expect(isDumbbell("Barbell Row")).toBe(false);
  });
  it("describes rest per exercise", () => {
    const steps = buildSteps(w);
    expect(restSummary(steps, "Dumbbell Fly")).toBe("rest 75s between sets, 120s before the next exercise");
    expect(restSummary(steps, "Plank")).toBeNull();
  });
  it("derives numeric HYROX targets from the goal time", () => {
    const blocks = [{ name: "Warm-up", detail: "" }, { name: "Run 1", detail: "" }, { name: "SkiErg", detail: "" }, { name: "Rowing", detail: "" }, { name: "Wall balls", detail: "" }];
    const t = hyroxBlockTargets(blocks, 80 * 60); // 1:20:00 goal -> runs = 2400 s / 8 = 300 s
    expect(t["Run 1"]).toBe(300);
    expect(t["SkiErg"]).toBeGreaterThan(0);
    expect(t["Rowing"]).toBeGreaterThan(0);
    expect(t["Wall balls"]).toBeGreaterThan(0);
    expect(t["Warm-up"]).toBeUndefined();
    expect(hyroxBlockTargets(blocks, null)).toEqual({});
  });
});

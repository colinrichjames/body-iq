import { describe, expect, it } from "vitest";
import { computeInsights } from "./insights";
import type { BodyScan, DailyHealth, NutritionDay, Profile, Workout } from "./types";

const today = "2026-11-25";
const w = (date: string, status: string, sport = "strength") => ({ id: date + status, workout_date: date, status, sport, title: "x" }) as unknown as Workout;
const profile = { calorie_target: 2500, protein_target_g: 180 } as unknown as Profile;
const base = { today, scans: [] as BodyScan[], workouts: [] as Workout[], nutrition: [] as NutritionDay[], profile, nextRace: null };
const cat = (i: ReturnType<typeof computeInsights>, k: string) => i.categories.find((c) => c.key === k)!;

describe("Body IQ score", () => {
  it("upcoming planned sessions do not count, and the message says why", () => {
    const ins = computeInsights({ ...base, workouts: [w("2026-11-20", "completed"), w("2026-11-22", "completed"), w("2026-11-27", "planned"), w("2026-11-28", "planned")] });
    const t = cat(ins, "training");
    expect(t.score).toBeNull();
    expect(t.missing).toMatch(/1 more/);
    expect(t.note).toMatch(/2 still upcoming/);
  });
  it("scores training once 3 sessions are due (1 done + 2 past planned)", () => {
    const ins = computeInsights({ ...base, workouts: [w("2026-11-24", "completed"), w("2026-11-20", "planned"), w("2026-11-21", "planned")] });
    expect(cat(ins, "training").score).toBeCloseTo(8.3, 1);
  });
  it("nutrition scores from a single logged day", () => {
    const nutrition = [{ day: today, calories: 2500, protein_g: 180, sodium_mg: null }] as unknown as NutritionDay[];
    const n = cat(computeInsights({ ...base, nutrition }), "nutrition");
    expect(n.score).not.toBeNull();
  });
  it("body names the exact missing input", () => {
    const scans = [{ scanned_at: "2026-11-01T00:00:00Z" }] as unknown as BodyScan[];
    expect(cat(computeInsights({ ...base, scans }), "body").missing).toMatch(/second body scan/);
  });
  it("recovery and activity score from Garmin daily data", () => {
    const health = [{ day: today, sleep_seconds: 7.5 * 3600, body_battery_max: 80, steps: 8000, hrv_ms: null }] as unknown as DailyHealth[];
    const ins = computeInsights({ ...base, health });
    expect(cat(ins, "recovery").score).toBe(25);
    expect(cat(ins, "activity").score).toBe(10);
  });
  it("overall is points earned / possible over scored categories", () => {
    const health = [{ day: today, sleep_seconds: 7.5 * 3600, body_battery_max: 80, steps: 4000 }] as unknown as DailyHealth[];
    expect(computeInsights({ ...base, health }).score).toBe(Math.round(((25 + 5) / 35) * 100));
  });
  it("every null category states what is missing", () => {
    for (const c of computeInsights(base).categories) expect(c.score === null ? c.missing : null).not.toBe("");
    expect(computeInsights(base).categories.every((c) => c.score !== null || !!c.missing)).toBe(true);
  });
});

import { presentScore } from "./insights";

describe("presentScore", () => {
  it("shows no number with 1 or 2 categories, and says how many more areas are needed", () => {
    const one = presentScore({ score: 93, available: 1 });
    expect(one.value).toBeNull();
    expect(one.provisional).toBe(true);
    expect(one.basis).toBe("Based on 1 of 5 categories");
    expect(one.hint).toBe("Add data in 2 more areas to see your score.");
    expect(presentScore({ score: 100, available: 2 }).value).toBeNull();
    expect(presentScore({ score: 100, available: 2 }).hint).toBe("Add data in 1 more area to see your score.");
  });
  it("shows the number with a Provisional badge at 3 and 4 categories", () => {
    for (const n of [3, 4]) {
      const p = presentScore({ score: 72, available: n });
      expect(p.value).toBe(72);
      expect(p.provisional).toBe(true);
      expect(p.basis).toBe(`Based on ${n} of 5 categories`);
    }
  });
  it("is a normal score at 5 of 5", () => {
    const p = presentScore({ score: 88, available: 5 });
    expect(p).toMatchObject({ value: 88, provisional: false, hint: null, basis: "Based on 5 of 5 categories" });
  });
  it("shows nothing when there is no score at all", () => {
    expect(presentScore({ score: null, available: 0 }).value).toBeNull();
  });
});

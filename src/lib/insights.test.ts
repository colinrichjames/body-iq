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

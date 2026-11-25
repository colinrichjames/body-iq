import { describe, expect, it } from "vitest";
import { checkinDue, coachAdvice, mergeWeights, weightTrend, wantedRate, type Trend } from "./coach";

const day = (n: number) => `2026-11-${String(n).padStart(2, "0")}`;
const trend = (rate: number): Trend => ({ trendWeight: 180, ratePerWeek: rate, points: 8, spanDays: 20 });
const base = { mode: "lose" as const, rate: 1, targets: { calories: 2400, protein: 180, carbs: 250, fat: 70 }, restCalories: 2200, loggedDays: 12 };

describe("weightTrend", () => {
  it("needs 3 points over 10 days", () => {
    expect(weightTrend([{ day: day(1), weight: 180 }, { day: day(5), weight: 179 }], day(20))).toBeNull();
    expect(weightTrend([{ day: day(1), weight: 180 }, { day: day(3), weight: 180 }, { day: day(5), weight: 180 }], day(20))).toBeNull();
  });
  it("finds a steady 1 lb/week loss", () => {
    const pts = [0, 4, 8, 12, 16, 20].map((d, i) => ({ day: day(1 + d), weight: 185 - (d / 7) * 1 + (i % 2 ? 0.2 : -0.2) }));
    const t = weightTrend(pts, day(21))!;
    expect(t.ratePerWeek).toBeGreaterThan(-1.2);
    expect(t.ratePerWeek).toBeLessThan(-0.8);
    expect(t.trendWeight).toBeGreaterThan(181);
    expect(t.trendWeight).toBeLessThan(184);
  });
  it("ignores weights outside the window", () => {
    expect(weightTrend([{ day: "2026-09-01", weight: 200 }, { day: day(1), weight: 180 }, { day: day(8), weight: 180 }, { day: day(15), weight: 180 }], day(15))!.ratePerWeek).toBe(0);
  });
});

describe("mergeWeights and wantedRate", () => {
  it("lets a weigh-in beat a scan on the same day", () => {
    expect(mergeWeights([{ day: day(2), weight: 181 }], [{ day: day(2), weight: 185 }, { day: day(1), weight: 186 }])).toEqual([{ day: day(1), weight: 186 }, { day: day(2), weight: 181 }]);
  });
  it("signs the goal", () => {
    expect(wantedRate("lose", 0.5)).toBe(-0.5);
    expect(wantedRate("gain", null)).toBe(0.5);
    expect(wantedRate("maintain", 1)).toBe(0);
  });
});

describe("coachAdvice", () => {
  it("asks for data first", () => {
    expect(coachAdvice({ ...base, trend: null }).status).toBe("need_data");
    expect(coachAdvice({ ...base, trend: trend(-1), loggedDays: 3 }).status).toBe("need_data");
    expect(coachAdvice({ ...base, trend: trend(-1), targets: { calories: null, protein: null, carbs: null, fat: null } }).status).toBe("need_data");
  });
  it("is on track near the goal rate", () => {
    expect(coachAdvice({ ...base, trend: trend(-0.95) }).status).toBe("on_track");
  });
  it("cuts when losing too slowly, capped at 250", () => {
    const a = coachAdvice({ ...base, trend: trend(0) });
    expect(a.status).toBe("adjust");
    expect(a.delta).toBe(-250);
    expect(a.newCalories).toBe(2150);
    expect(a.newRestCalories).toBe(1950);
    expect(a.carbsDelta).toBe(-62);
  });
  it("sizes a moderate gap in 25 kcal steps", () => {
    const a = coachAdvice({ ...base, trend: trend(-0.6) });
    expect(a.delta).toBe(-200);
  });
  it("adds food when losing too fast", () => {
    const a = coachAdvice({ ...base, trend: trend(-2) });
    expect(a.delta).toBe(250);
    expect(a.headline).toContain("Eat");
  });
  it("adds food when maintaining but dropping", () => {
    expect(coachAdvice({ ...base, mode: "maintain", trend: trend(-0.7) }).delta).toBeGreaterThan(0);
  });
  it("never goes under the calorie floor", () => {
    const a = coachAdvice({ ...base, targets: { ...base.targets, calories: 1550 }, restCalories: null, trend: trend(0) });
    expect(a.newCalories).toBe(1500);
    const b = coachAdvice({ ...base, targets: { ...base.targets, calories: 1500 }, restCalories: null, trend: trend(0) });
    expect(b.status).toBe("on_track");
    expect(b.delta).toBe(0);
  });
});

describe("checkinDue", () => {
  it("is due after a week or never", () => {
    expect(checkinDue(null, day(10))).toBe(true);
    expect(checkinDue(day(3), day(10))).toBe(true);
    expect(checkinDue(day(4), day(10))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { fuelCheck, hydrationTarget, sessionTotals } from "./fuel";

const w = (o: Partial<Parameters<typeof fuelCheck>[0]> = {}) => ({ sport: "run" as const, planned_duration_min: 120, actual_duration_min: 120, fuel_carbs_g: null, fluid_ml: null, sodium_mg: null, ...o });

describe("sessionTotals", () => {
  it("scales per-hour ranges to the session and skips short ones", () => {
    expect(sessionTotals(120, "run")).toEqual({ carbs: [90, 150], fluid: [800, 1600], sodium: [600, 1200] });
    expect(sessionTotals(120, "bike")?.carbs).toEqual([120, 180]);
    expect(sessionTotals(60, "run")).toBeNull();
  });
});

describe("fuelCheck", () => {
  it("is null for short sessions or when nothing was logged", () => {
    expect(fuelCheck(w({ fuel_carbs_g: 30, actual_duration_min: 60, planned_duration_min: 60 }))).toBeNull();
    expect(fuelCheck(w())).toBeNull();
  });
  it("flags low carbs per hour", () => {
    const c = fuelCheck(w({ fuel_carbs_g: 60, fluid_ml: 1400, sodium_mg: 900 }))!;
    expect(c.rows[0]).toMatchObject({ perHour: 30, status: "low" });
    expect(c.rows[1]).toMatchObject({ perHour: 700, status: "ok" });
    expect(c.rows[2]).toMatchObject({ perHour: 450, status: "ok" });
    expect(c.summary).toContain("under the 45-75 g/h range");
  });
  it("uses actual time over planned and the bike range", () => {
    const c = fuelCheck(w({ sport: "bike", fuel_carbs_g: 240, planned_duration_min: 90, actual_duration_min: 180 }))!;
    expect(c.hours).toBe(3);
    expect(c.rows[0]).toMatchObject({ perHour: 80, status: "ok" });
    expect(c.rows[1].status).toBe("none");
  });
});

describe("hydrationTarget", () => {
  it("is 35 ml/kg plus 500 ml per training hour, rounded to 50", () => {
    expect(hydrationTarget(80, 0)).toBe(2800);
    expect(hydrationTarget(80, 90)).toBe(3550);
    expect(hydrationTarget(null, 0)).toBe(2500);
  });
});

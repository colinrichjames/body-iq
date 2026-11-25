import { describe, expect, it } from "vitest";
import { chartPath, fmtChange, lastChange, totalChange, trendPoints } from "./scan-trends";
import type { BodyScan } from "./types";

const scan = (d: string, o: Partial<BodyScan>) => ({ id: d, scanned_at: d, created_at: `${d}T08:00:00Z`, weight_lb: null, body_fat_pct: null, skeletal_muscle_lb: null, fat_mass_lb: null, ...o }) as BodyScan;

describe("scan trends", () => {
  const scans = [scan("2026-11-20", { weight_lb: 178, body_fat_pct: 14 }), scan("2026-10-01", { weight_lb: 182.4 }), scan("2026-11-01", { weight_lb: 180, body_fat_pct: 15.2 })];
  it("orders oldest first and skips scans without the value", () => {
    expect(trendPoints(scans, "weight_lb").map((p) => p.value)).toEqual([182.4, 180, 178]);
    expect(trendPoints(scans, "body_fat_pct").map((p) => p.value)).toEqual([15.2, 14]);
    expect(trendPoints(scans, "fat_mass_lb")).toEqual([]);
  });
  it("keeps the latest entry when two scans share a day", () => {
    const two = [scan("2026-11-01", { weight_lb: 180 }), { ...scan("2026-11-01", { weight_lb: 179 }), created_at: "2026-11-01T18:00:00Z" }];
    expect(trendPoints(two, "weight_lb").map((p) => p.value)).toEqual([179]);
  });
  it("reports changes rounded to one decimal", () => {
    const p = trendPoints(scans, "weight_lb");
    expect(lastChange(p)).toBe(-2);
    expect(totalChange(p)).toBe(-4.4);
    expect(lastChange(p.slice(0, 1))).toBeNull();
    expect(fmtChange(-1.2, "%")).toBe("-1.2 pts");
    expect(fmtChange(0.6, "lb")).toBe("+0.6 lb");
  });
  it("maps points into the chart box, flat series mid-height", () => {
    const pts = chartPath(trendPoints(scans, "weight_lb"), 280, 84);
    expect(pts[0].x).toBe(8);
    expect(pts[2].x).toBe(272);
    expect(pts[0].y).toBeLessThan(pts[2].y);
    expect(chartPath([{ date: "2026-11-01", value: 5 }, { date: "2026-11-02", value: 5 }], 280, 84).every((p) => p.y === 42)).toBe(true);
  });
});

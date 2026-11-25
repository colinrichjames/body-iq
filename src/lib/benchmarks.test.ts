import { describe, expect, it } from "vitest";
import { benchmarkRows, fmtDelta } from "./benchmarks";
import type { HyroxBenchmark } from "./types";

const b = (station: string, effort_date: string, time_sec: number) => ({ id: `${station}${effort_date}`, user_id: "u", station, effort_date, time_sec, notes: null }) as HyroxBenchmark;

describe("benchmarkRows", () => {
  const rows = benchmarkRows(["skierg", "row"], [b("skierg", "2026-11-01", 300), b("skierg", "2026-11-20", 285), b("skierg", "2026-10-01", 310), b("row", "2026-11-05", 270)], new Map([["skierg", 280], ["row", null]]));
  it("compares the latest effort with the previous one and the target", () => {
    expect(rows[0]).toMatchObject({ best: 285, vsPrevious: -15, vsTarget: 5, efforts: 3 });
    expect(rows[0].latest?.time_sec).toBe(285);
  });
  it("has no deltas with a single effort or no target", () => {
    expect(rows[1]).toMatchObject({ vsPrevious: null, vsTarget: null, efforts: 1 });
  });
});

describe("fmtDelta", () => {
  it("signs faster and slower, and calls under a second even", () => {
    expect(fmtDelta(-12)).toBe("-0:12");
    expect(fmtDelta(68)).toBe("+1:08");
    expect(fmtDelta(0.4)).toBe("even");
  });
});

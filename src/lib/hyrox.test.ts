import { describe, expect, it } from "vitest";
import { hyroxSplits, STATIONS } from "./hyrox";

const total = (r: ReturnType<typeof hyroxSplits>) => r.splits.reduce((a, s) => a + s.sec, 0) + r.roxzoneSec;
const stationSec = (r: ReturnType<typeof hyroxSplits>, key: string) => r.splits.find((s) => s.key === key)!.sec;

describe("hyroxSplits", () => {
  it("without benchmarks keeps the default 50% running / 6% Roxzone split and sums to the goal", () => {
    const r = hyroxSplits(5400);
    expect(r.runSec).toBeCloseTo(2700);
    expect(r.roxzoneSec).toBeCloseTo(324);
    expect(total(r)).toBeCloseTo(5400);
  });
  it("gives a slow station more of the goal and keeps the total", () => {
    const base = hyroxSplits(5400);
    const withBench = hyroxSplits(5400, { sled_push: 400 });
    expect(stationSec(withBench, "sled_push")).toBeGreaterThan(stationSec(base, "sled_push"));
    expect(stationSec(withBench, "row")).toBeLessThan(stationSec(base, "row"));
    expect(total(withBench)).toBeCloseTo(5400);
  });
  it("uses the benchmarks to set the run/station balance once the run and all eight stations are logged", () => {
    const best: Record<string, number> = { run_1km: 600 };
    for (const s of STATIONS) best[s.key] = 200;
    const r = hyroxSplits(5400, best);
    expect(r.runSec / 5400).toBeGreaterThan(0.5); // runs are the slow part here
    expect(r.runSec / 5400).toBeLessThanOrEqual(0.6);
    expect(total(r)).toBeCloseTo(5400);
  });
  it("only a partial set of benchmarks leaves the run share at the default", () => {
    expect(hyroxSplits(5400, { run_1km: 600, row: 200 }).runSec).toBeCloseTo(2700);
  });
  it("ignores zero or missing times", () => {
    expect(hyroxSplits(5400, { row: 0 }).splits).toEqual(hyroxSplits(5400).splits);
  });
});

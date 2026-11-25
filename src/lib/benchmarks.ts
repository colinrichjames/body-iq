import type { HyroxBenchmark } from "./types";

export type BenchmarkRow = {
  key: string;
  latest: HyroxBenchmark | null;
  best: number | null;
  /** Seconds faster (negative) or slower (positive) than the effort before the latest. */
  vsPrevious: number | null;
  /** Seconds faster (negative) or slower (positive) than the race target. */
  vsTarget: number | null;
  target: number | null;
  efforts: number;
};

/** Per-station summary. `benchmarks` may be in any order; the newest effort_date is the latest. */
export function benchmarkRows(keys: string[], benchmarks: HyroxBenchmark[], targets: Map<string, number | null>): BenchmarkRow[] {
  const sorted = [...benchmarks].sort((a, b) => (a.effort_date === b.effort_date ? 0 : a.effort_date < b.effort_date ? 1 : -1));
  return keys.map((key) => {
    const own = sorted.filter((b) => b.station === key);
    const latest = own[0] ?? null;
    const prev = own[1] ?? null;
    const target = targets.get(key) ?? null;
    return {
      key,
      latest,
      best: own.length ? Math.min(...own.map((b) => b.time_sec)) : null,
      vsPrevious: latest && prev ? latest.time_sec - prev.time_sec : null,
      vsTarget: latest && target ? Math.round(latest.time_sec - target) : null,
      target,
      efforts: own.length,
    };
  });
}

/** "-0:12" faster, "+0:08" slower, "even" within a second. */
export function fmtDelta(sec: number): string {
  const s = Math.round(Math.abs(sec));
  if (s < 1) return "even";
  return `${sec < 0 ? "-" : "+"}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

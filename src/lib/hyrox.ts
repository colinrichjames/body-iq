// HYROX race structure and split calculator (scope HX-1, HX-2).
// Race format: 8 x (1 km run + 1 station), with Roxzone transitions in between.

export type StationKey =
  | "skierg"
  | "sled_push"
  | "sled_pull"
  | "burpee_broad_jump"
  | "row"
  | "farmers_carry"
  | "sandbag_lunges"
  | "wall_balls";

export const STATIONS: { key: StationKey; label: string; work: string; weight: number }[] = [
  { key: "skierg", label: "SkiErg", work: "1,000 m", weight: 14 },
  { key: "sled_push", label: "Sled Push", work: "50 m", weight: 8 },
  { key: "sled_pull", label: "Sled Pull", work: "50 m", weight: 11 },
  { key: "burpee_broad_jump", label: "Burpee Broad Jumps", work: "80 m", weight: 17 },
  { key: "row", label: "Row", work: "1,000 m", weight: 14 },
  { key: "farmers_carry", label: "Farmers Carry", work: "200 m", weight: 6 },
  { key: "sandbag_lunges", label: "Sandbag Lunges", work: "100 m", weight: 14 },
  { key: "wall_balls", label: "Wall Balls", work: "75-100 reps", weight: 16 },
];

export const BENCHMARK_KEYS: { key: string; label: string }[] = [
  { key: "run_1km", label: "1 km run (race effort)" },
  ...STATIONS.map((s) => ({ key: s.key as string, label: s.label })),
];

// Starting shares of total time. They are rules of thumb, not published standards:
// adjust once benchmark efforts are logged.
export const RUN_SHARE = 0.5;
export const ROXZONE_SHARE = 0.06;

export type Split = { label: string; kind: "run" | "station" | "roxzone"; sec: number; key?: string };

/**
 * Splits a goal time into 8 km runs, 8 stations and Roxzone transition time.
 *
 * With no benchmarks the split is the rule of thumb above. With the user's best times (seconds, keyed by station key and
 * "run_1km"), the station budget is shared out in proportion to how long each station takes them, so a slow station
 * gets more of the goal and a strong one less. A station with no benchmark counts at its default share. When the run
 * and all eight stations have a benchmark, the run/station balance follows the benchmarks too (kept between 35% and 60%
 * running). The total always equals the goal.
 */
export function hyroxSplits(goalSec: number, best: Record<string, number> = {}): { splits: Split[]; runSec: number; roxzoneSec: number; stationsSec: number } {
  const weightSum = STATIONS.reduce((a, s) => a + s.weight, 0);
  const roxzoneSec = goalSec * ROXZONE_SHARE;
  const allBenched = best.run_1km > 0 && STATIONS.every((s) => best[s.key] > 0);
  let runShare = RUN_SHARE;
  if (allBenched) {
    const runs = 8 * best.run_1km;
    const stations = STATIONS.reduce((a, s) => a + best[s.key], 0);
    runShare = Math.min(0.6, Math.max(0.35, (runs / (runs + stations)) * (1 - ROXZONE_SHARE)));
  }
  const runSec = goalSec * runShare;
  const stationsSec = goalSec - runSec - roxzoneSec;
  // Reference time per station: the user's best where logged, otherwise the default share, on the same scale.
  const defaults = STATIONS.map((s) => (stationsSec * s.weight) / weightSum);
  const refs = STATIONS.map((s, i) => (best[s.key] > 0 ? best[s.key] : defaults[i]));
  const refSum = refs.reduce((a, r) => a + r, 0);
  const splits: Split[] = [];
  STATIONS.forEach((s, i) => {
    splits.push({ label: `Run ${i + 1}`, kind: "run", sec: runSec / 8 });
    splits.push({ label: s.label, kind: "station", sec: (stationsSec * refs[i]) / refSum, key: s.key });
  });
  return { splits, runSec, roxzoneSec, stationsSec };
}

export function fmtTime(totalSec: number): string {
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** Parses "80", "80:30", "1:20:00" (h:mm:ss) or "1:20" (h:mm when under 10 hours in a race context is ambiguous: treated as mm:ss). */
export function parseDuration(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  const parts = t.split(":").map((p) => p.trim());
  if (parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const n = parts.map(Number);
  let sec: number;
  if (n.length === 1) sec = n[0] * 60; // bare number = minutes
  else if (n.length === 2) sec = n[0] * 60 + n[1]; // mm:ss
  else if (n.length === 3) sec = n[0] * 3600 + n[1] * 60 + n[2];
  else return null;
  return sec > 0 ? Math.round(sec) : null;
}

/** Race goal times are entered as h:mm:ss, or minutes for HYROX-length goals. For triathlons "5:30" would mean 5 min 30 s, so require h:mm:ss. */
export const isHyrox = (raceType: string) => raceType === "hyrox_single" || raceType === "hyrox_doubles";

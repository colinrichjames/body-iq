import type { DailyHealth } from "./types";

export type Readiness = {
  status: "green" | "amber" | "red";
  headline: string;
  reasons: string[];
  day: string;
  metrics: { sleepH: number | null; hrv: number | null; hrvBaseline: number | null; rhr: number | null; battery: number | null; stress: number | null };
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Rules-based readiness (scope D-2, section 2.3). Deterministic and explainable:
 * each flag adds points, 0-1 = green, 2-3 = amber, 4+ = red.
 * `rows` is newest first; the latest row is the one scored, the previous 7 days are the baseline.
 */
export function computeReadiness(rows: DailyHealth[]): Readiness | null {
  const [latest, ...older] = rows;
  if (!latest) return null;
  const base = older.slice(0, 7);
  const sleepH = latest.sleep_seconds !== null ? latest.sleep_seconds / 3600 : null;
  const hrvBaseline = avg(base.map((r) => r.hrv_ms).filter((v): v is number => v !== null));
  const rhrBaseline = avg(base.map((r) => r.resting_hr).filter((v): v is number => v !== null));
  const reasons: string[] = [];
  let points = 0;

  if (sleepH !== null) {
    if (sleepH < 5.5) {
      points += 2;
      reasons.push(`Slept ${sleepH.toFixed(1)} h.`);
    } else if (sleepH < 6.5) {
      points += 1;
      reasons.push(`Slept ${sleepH.toFixed(1)} h, under 6.5.`);
    }
  }
  if (latest.hrv_ms !== null && hrvBaseline !== null && base.length >= 3) {
    const ratio = latest.hrv_ms / hrvBaseline;
    if (ratio < 0.8) {
      points += 2;
      reasons.push(`HRV ${Math.round(latest.hrv_ms)} ms is ${Math.round((1 - ratio) * 100)}% below your 7-day baseline.`);
    } else if (ratio < 0.9) {
      points += 1;
      reasons.push(`HRV ${Math.round(latest.hrv_ms)} ms is below your 7-day baseline.`);
    }
  }
  if (latest.resting_hr !== null && rhrBaseline !== null && base.length >= 3 && latest.resting_hr >= rhrBaseline + 5) {
    points += 1;
    reasons.push(`Resting HR ${latest.resting_hr} is ${Math.round(latest.resting_hr - rhrBaseline)} bpm above baseline.`);
  }
  const battery = latest.body_battery_max;
  if (battery !== null) {
    if (battery < 25) {
      points += 2;
      reasons.push(`Body Battery peaked at ${battery}.`);
    } else if (battery < 40) {
      points += 1;
      reasons.push(`Body Battery peaked at only ${battery}.`);
    }
  }
  if (latest.stress_avg !== null && latest.stress_avg >= 50) {
    points += 1;
    reasons.push(`Average stress ${latest.stress_avg}.`);
  }

  const status = points >= 4 ? "red" : points >= 2 ? "amber" : "green";
  const headline =
    status === "green" ? "Recovered. Train as planned." : status === "amber" ? "Mixed signals. Consider an easier session." : "Under-recovered. Take it easy or rest.";
  return {
    status,
    headline,
    reasons: reasons.length ? reasons : ["No recovery flags."],
    day: latest.day,
    metrics: { sleepH, hrv: latest.hrv_ms, hrvBaseline, rhr: latest.resting_hr, battery, stress: latest.stress_avg },
  };
}

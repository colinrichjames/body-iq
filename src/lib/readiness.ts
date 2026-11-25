import type { DailyHealth, HealthDay, RecoveryCheckin } from "./types";

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
export function computeReadiness(rows: HealthDay[]): Readiness | null {
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

  if (latest.soreness !== null && latest.soreness !== undefined && latest.soreness >= 4) {
    points += latest.soreness >= 5 ? 2 : 1;
    reasons.push(`Soreness ${latest.soreness} out of 5.`);
  }
  if (latest.energy !== null && latest.energy !== undefined && latest.energy <= 2) {
    points += latest.energy <= 1 ? 2 : 1;
    reasons.push(`Energy ${latest.energy} out of 5.`);
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

/**
 * Garmin rows plus manual check-ins, newest first. A check-in fills in sleep when the watch has none for that day
 * (the watch wins when it has a value), and adds soreness and energy. A day with only a check-in becomes a row
 * with the other numbers empty, so people without a watch still get a readiness call.
 */
export function mergeCheckins(rows: DailyHealth[], checkins: RecoveryCheckin[]): HealthDay[] {
  const byDay = new Map<string, HealthDay>(rows.map((r) => [r.day, { ...r }]));
  for (const c of checkins) {
    const base: HealthDay = byDay.get(c.day) ?? { user_id: "", day: c.day, sleep_seconds: null, sleep_score: null, hrv_ms: null, resting_hr: null, body_battery_max: null, body_battery_min: null, stress_avg: null, steps: null, manual: true };
    if (base.sleep_seconds === null && c.sleep_hours !== null && c.sleep_hours !== undefined) base.sleep_seconds = Math.round(Number(c.sleep_hours) * 3600);
    base.soreness = c.soreness;
    base.energy = c.energy;
    byDay.set(c.day, base);
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

export type Act = { id: string; sport: string | null; title: string | null; started_at: string; duration_sec: number | null; distance_m: number | string | null; avg_hr: number | null };
export type Units = "imperial" | "metric";
export const STEP_GOAL = 10_000;

export type Kind = "Walk" | "Run" | "Ride" | "Swim" | "Hike" | "Workout";
export const KIND_ICON: Record<Kind, string> = { Walk: "🚶", Run: "🏃", Ride: "🚴", Swim: "🏊", Hike: "🥾", Workout: "🏋️" };
const DISTANCE_KINDS: Kind[] = ["Walk", "Run", "Ride", "Swim", "Hike"];

/** Groups Garmin's many type keys into the handful Garmin's own summary uses. */
export function kindOf(typeKey: string | null): Kind {
  const k = (typeKey ?? "").toLowerCase();
  if (/hik/.test(k)) return "Hike";
  if (/walk/.test(k)) return "Walk";
  if (/run|treadmill/.test(k)) return "Run";
  if (/cycl|bik|spin/.test(k)) return "Ride";
  if (/swim/.test(k)) return "Swim";
  return "Workout";
}

const dayIn = (tz: string, d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export function formatDuration(sec: number | null): string {
  const s = Math.max(0, Math.round(sec ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}

const M_PER_MI = 1609.344;
export function formatDistance(m: number | string | null, units: Units): string | null {
  const v = m === null || m === undefined ? 0 : Number(m);
  if (!(v > 0)) return null;
  return units === "metric" ? `${(v / 1000).toFixed(v >= 100_000 ? 0 : 2).replace(/\.?0+$/, "")} km` : `${(v / M_PER_MI).toFixed(2).replace(/\.?0+$/, "")} mi`;
}

/** Pace for walks, runs and hikes ("25:15 /mi"), speed for rides ("14.2 mph"). Null when there's no distance or time. */
export function paceOrSpeed(kind: Kind, a: Pick<Act, "duration_sec" | "distance_m">, units: Units): string | null {
  const d = Number(a.distance_m ?? 0);
  const t = a.duration_sec ?? 0;
  if (!(d > 0) || !(t > 0) || !DISTANCE_KINDS.includes(kind) || kind === "Swim") return null;
  const unitM = units === "metric" ? 1000 : M_PER_MI;
  if (kind === "Ride") return `${((d / unitM) / (t / 3600)).toFixed(1)} ${units === "metric" ? "km/h" : "mph"}`;
  const secPer = t / (d / unitM);
  const m = Math.floor(secPer / 60);
  const s = Math.round(secPer % 60);
  return m > 99 ? null : `${s === 60 ? m + 1 : m}:${String(s === 60 ? 0 : s).padStart(2, "0")} /${units === "metric" ? "km" : "mi"}`;
}

export function todaysActivities(acts: Act[], today: string, tz: string): Act[] {
  return acts.filter((a) => dayIn(tz, new Date(a.started_at)) === today).sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
}

export type KindTotal = { kind: Kind; count: number; label: string };
/** Last-7-days rollup per kind, biggest count first: "4 Walks 9.1 mi", "3 Workouts 2:49:31". */
export function weekTotals(acts: Act[], units: Units): KindTotal[] {
  const by = new Map<Kind, { count: number; m: number; sec: number }>();
  for (const a of acts) {
    const k = kindOf(a.sport);
    const t = by.get(k) ?? { count: 0, m: 0, sec: 0 };
    t.count++;
    t.m += Number(a.distance_m ?? 0) || 0;
    t.sec += a.duration_sec ?? 0;
    by.set(k, t);
  }
  return [...by]
    .map(([kind, t]) => ({ kind, count: t.count, label: DISTANCE_KINDS.includes(kind) && t.m > 0 ? (formatDistance(t.m, units) as string) : formatDuration(t.sec) }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}

export const plural = (kind: Kind, n: number) => (n === 1 ? kind : kind === "Hike" ? "Hikes" : `${kind}s`);

export type StepDay = { day: string; letter: string; met: boolean; steps: number | null; isToday: boolean };
/** Seven days ending today with a check when the step goal was met. */
export function stepWeek(steps: { day: string; steps: number | null }[], today: string, goal = STEP_GOAL): StepDay[] {
  const by = new Map(steps.map((s) => [s.day, s.steps]));
  const out: StepDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    const n = by.get(day) ?? null;
    out.push({ day, letter: "SMTWTFS"[d.getUTCDay()], met: n !== null && n >= goal, steps: n, isToday: i === 0 });
  }
  return out;
}

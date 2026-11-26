export type DistUnit = "mi" | "km";
export const KM_PER_MI = 1.609344;

export const isUnit = (u: unknown): u is DistUnit => u === "mi" || u === "km";

/** Converts what the user typed to km, keeping 4 decimals so it converts back cleanly. */
export function toKm(value: number, unit: DistUnit): number {
  const km = unit === "mi" ? value * KM_PER_MI : value;
  return Math.round(km * 10000) / 10000;
}

/** km back to the user's unit, rounded to 2 decimals (3.1 mi stays 3.1). */
export function fromKm(km: number, unit: DistUnit): number {
  const v = unit === "mi" ? km / KM_PER_MI : km;
  return Math.round(v * 100) / 100;
}

export const fmtDist = (km: number, unit: DistUnit) => `${fromKm(km, unit)} ${unit}`;

export const MIN_PACE_MIN_PER_MI = 3;
export const MAX_PACE_MIN_PER_MI = 20;

/** Returns an error message when the pace is not plausible for a run, otherwise null. */
export function paceProblem(minutes: number | null, km: number | null): string | null {
  if (!minutes || !km || minutes <= 0 || km <= 0) return null;
  const pace = minutes / (km / KM_PER_MI);
  if (pace < MIN_PACE_MIN_PER_MI || pace > MAX_PACE_MIN_PER_MI) return "That pace looks off. Check the duration and distance.";
  return null;
}

/** Rowing (an "other" session titled row/erg/rower) is paced per 500 m. */
export const isRow = (sport: string, title?: string | null) => sport === "other" && /\b(row|rowing|rower|erg|skierg)\b/i.test(title ?? "");

export type PaceKind = "run" | "swim" | "row" | "bike";
export const paceKind = (sport: string, title?: string | null): PaceKind | null =>
  sport === "run" ? "run" : sport === "swim" ? "swim" : sport === "bike" ? "bike" : isRow(sport, title) ? "row" : null;

const mmss = (min: number) => {
  let m = Math.floor(min);
  let s = Math.round((min - m) * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
};

/** Sane bands. Run 3:00-20:00 /mi, swim 0:50-5:00 /100 m, row 1:15-4:30 /500 m, bike 3-45 mph. */
const BAND = { swim: [0.83, 5], row: [1.25, 4.5], bike: [3, 45] } as const;

/** The pace or speed in the unit that fits the sport, for display ("2:05 /100 m", "17.5 mph"). Null when it can't be worked out. */
export function paceLabel(sport: string, minutes: number | null, km: number | null, unit: DistUnit, title?: string | null): string | null {
  const kind = paceKind(sport, title);
  if (!kind || !minutes || !km || minutes <= 0 || km <= 0) return null;
  if (kind === "run") return fmtPace(minutes, km, unit);
  if (kind === "swim") return `${mmss(minutes / (km * 10))} /100 m`;
  if (kind === "row") return `${mmss(minutes / (km * 2))} /500 m`;
  const mph = km / KM_PER_MI / (minutes / 60);
  return `${Math.round(mph * 10) / 10} mph`;
}

/** The pace check for a saved or planned session, per sport. Null when fine or when the sport has no band. */
export function sessionPaceProblem(sport: string, minutes: number | null, km: number | null, title?: string | null): string | null {
  const kind = paceKind(sport, title);
  if (!kind) return null;
  if (kind === "run") return paceProblem(minutes, km);
  if (!minutes || !km || minutes <= 0 || km <= 0) return null;
  const bad = "That pace looks off. Check the duration and distance.";
  if (kind === "bike") {
    const mph = km / KM_PER_MI / (minutes / 60);
    return mph < BAND.bike[0] || mph > BAND.bike[1] ? bad : null;
  }
  const per = kind === "swim" ? minutes / (km * 10) : minutes / (km * 2);
  return per < BAND[kind][0] || per > BAND[kind][1] ? bad : null;
}

export function fmtPace(minutes: number, km: number, unit: DistUnit): string {
  const p = minutes / fromKmExact(km, unit);
  const m = Math.floor(p);
  const s = Math.round((p - m) * 60);
  if (s === 60) return `${m + 1}:00 /${unit}`;
  return `${m}:${String(s).padStart(2, "0")} /${unit}`;
}

const fromKmExact = (km: number, unit: DistUnit) => (unit === "mi" ? km / KM_PER_MI : km);

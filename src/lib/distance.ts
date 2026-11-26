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

/** The pace check for a saved or planned session. Only runs have a pace band today; other sports pass. */
export function sessionPaceProblem(sport: string, minutes: number | null, km: number | null): string | null {
  return sport === "run" ? paceProblem(minutes, km) : null;
}

export function fmtPace(minutes: number, km: number, unit: DistUnit): string {
  const p = minutes / fromKmExact(km, unit);
  const m = Math.floor(p);
  const s = Math.round((p - m) * 60);
  if (s === 60) return `${m + 1}:00 /${unit}`;
  return `${m}:${String(s).padStart(2, "0")} /${unit}`;
}

const fromKmExact = (km: number, unit: DistUnit) => (unit === "mi" ? km / KM_PER_MI : km);

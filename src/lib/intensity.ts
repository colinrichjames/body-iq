import type { Workout } from "./types";

export type Level = "easy" | "moderate" | "hard";

export type Classified = {
  level: Level;
  /** 75+ minute-style sessions: long runs and rides, bricks, simulations, race day. */
  long: boolean;
  /** Heavy lower-body strength (interferes with hard running if stacked). */
  heavyLegs: boolean;
  /** Hard running (tempo, intervals, long run, simulation, race). */
  hardRun: boolean;
  race: boolean;
};

type Input = Pick<Workout, "sport" | "title"> & { planned_duration_min?: number | null };

/** Rules-based intensity from the title and sport (the plan generator and your own titles). */
export function classify(w: Input): Classified {
  const t = w.title.toLowerCase();
  const race = /race day/.test(t);
  const sim = /simulation/.test(t);
  const brick = /brick/.test(t);
  const longSession = /\blong\b/.test(t) || sim || brick || race;
  const easy = /easy|shakeout|zone 2|mobility|recovery|stretch/.test(t) && !race && !sim;
  const quality = /tempo|interval|race-pace|repeats|threshold|sweet|sprint|vo2|hill/.test(t);

  let level: Level;
  if (race || sim || brick || longSession || quality) level = easy ? "moderate" : "hard";
  else if (easy || w.sport === "mobility") level = "easy";
  else if (w.sport === "strength") level = /legs|full body/.test(t) ? "hard" : "moderate";
  else level = "moderate";

  const heavyLegs = w.sport === "strength" && /legs|full body|squat|deadlift/.test(t) && !/\(light\)/.test(t);
  const hardRun = (w.sport === "run" || w.sport === "hyrox") && level === "hard";
  return { level, long: longSession, heavyLegs, hardRun, race };
}

const DEFAULT_RPE: Record<Level, number> = { easy: 3, moderate: 5, hard: 7.5 };

/** Session load = RPE x minutes (session-RPE). Falls back to a default RPE from the intensity rules. */
export function sessionLoad(w: Pick<Workout, "sport" | "title" | "rpe" | "actual_duration_min" | "planned_duration_min">): number {
  const minutes = w.actual_duration_min ?? w.planned_duration_min ?? 0;
  const rpe = w.rpe ?? (classify(w).race ? 9 : DEFAULT_RPE[classify(w).level]);
  return Math.round(rpe * minutes);
}

export const HARD_DAY_RPE = 8;

/** Planned load is an estimate: planned minutes x an RPE assumed from the session type (easy 3, moderate 5, hard 7.5, race 9). */
export function plannedLoad(w: Pick<Workout, "sport" | "title" | "planned_duration_min" | "actual_duration_min">): number {
  const minutes = w.planned_duration_min ?? w.actual_duration_min ?? 0;
  const c = classify(w);
  return Math.round((c.race ? 9 : DEFAULT_RPE[c.level]) * minutes);
}

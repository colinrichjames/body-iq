export type SetRow = {
  exercise: string;
  set_number: number;
  reps: number | null;
  weight_lb: number | null;
  rpe: number | null;
  workout_id: string;
  workouts: { workout_date: string; title: string } | { workout_date: string; title: string }[] | null;
};

export type Session = { workoutId: string; date: string; title: string; sets: SetRow[]; topWeight: number | null; e1rm: number | null; volume: number };

const dateOf = (r: SetRow) => (Array.isArray(r.workouts) ? r.workouts[0] : r.workouts);

/** Epley estimate of a one-rep max. Only meaningful for sets of up to ~12 reps. */
export const epley = (weight: number, reps: number) => (reps <= 1 ? weight : weight * (1 + reps / 30));

export function sessionsFor(rows: SetRow[], exercise: string): Session[] {
  const by = new Map<string, Session>();
  for (const r of rows) {
    if (r.exercise !== exercise) continue;
    const w = dateOf(r);
    if (!w) continue;
    const s = by.get(r.workout_id) ?? { workoutId: r.workout_id, date: w.workout_date, title: w.title, sets: [], topWeight: null, e1rm: null, volume: 0 };
    s.sets.push(r);
    if (r.weight_lb !== null) {
      s.topWeight = Math.max(s.topWeight ?? 0, Number(r.weight_lb));
      if (r.reps !== null && r.reps > 0 && r.reps <= 12) s.e1rm = Math.max(s.e1rm ?? 0, epley(Number(r.weight_lb), r.reps));
      s.volume += Number(r.weight_lb) * (r.reps ?? 0);
    }
    by.set(r.workout_id, s);
  }
  return [...by.values()].map((s) => ({ ...s, sets: s.sets.sort((a, b) => a.set_number - b.set_number) })).sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function exerciseIndex(rows: SetRow[]) {
  const names = new Map<string, { sessions: Set<string>; last: string; best: number | null }>();
  for (const r of rows) {
    const w = dateOf(r);
    if (!w) continue;
    const e = names.get(r.exercise) ?? { sessions: new Set(), last: "", best: null };
    e.sessions.add(r.workout_id);
    if (w.workout_date > e.last) e.last = w.workout_date;
    if (r.weight_lb !== null) e.best = Math.max(e.best ?? 0, Number(r.weight_lb));
    names.set(r.exercise, e);
  }
  return [...names.entries()].map(([name, e]) => ({ name, sessions: e.sessions.size, last: e.last, best: e.best })).sort((a, b) => (a.last < b.last ? 1 : -1));
}

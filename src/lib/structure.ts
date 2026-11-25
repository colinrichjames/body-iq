import type { Exercise, WorkoutStructure } from "./types";

/** One exercise per line: "Back squat 4x6 @ 135", "Plank 3x45s", "Pull-ups 3x8", or just a name. */
export function parseExercises(text: string): Exercise[] {
  const out: Exercise[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(.*?)\s+(\d+)\s*[x×]\s*(\d+)\s*(s|sec)?(?:\s*@\s*(\d+(?:\.\d+)?)\s*(?:lb|lbs)?)?\s*$/i.exec(line);
    if (m) {
      const e: Exercise = { name: m[1].trim(), sets: Number(m[2]) };
      if (m[4]) e.seconds = Number(m[3]);
      else e.reps = Number(m[3]);
      if (m[5]) e.weight_lb = Number(m[5]);
      out.push(e);
    } else out.push({ name: line });
  }
  return out;
}

export function formatExercises(list: Exercise[] | undefined): string {
  return (list ?? [])
    .map((e) => {
      const amount = e.seconds ? `${e.sets ?? 1}x${e.seconds}s` : e.reps ? `${e.sets ?? 1}x${e.reps}` : "";
      return [e.name, amount].filter(Boolean).join(" ") + (e.weight_lb ? ` @ ${e.weight_lb}` : "");
    })
    .join("\n");
}

/** Keeps blocks, rest and rounds that the editor doesn't touch. */
export function buildStructure(prev: WorkoutStructure | null, exercises: Exercise[], rounds: number | null, restSec: number | null): WorkoutStructure | null {
  const next: WorkoutStructure = { ...(prev ?? {}) };
  if (exercises.length) next.exercises = exercises;
  else delete next.exercises;
  if (rounds && exercises.length) next.rounds = rounds;
  else delete next.rounds;
  if (restSec !== null) next.rest_sec = restSec;
  else delete next.rest_sec;
  return Object.keys(next).length ? next : null;
}

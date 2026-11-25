import type { Exercise, WorkoutStructure } from "./types";

// "4x6", "3x45s", optionally "@ 135". The "s" only counts as seconds when it isn't the start of the next word.
const SET_PATTERN = /(\d+)\s*[x×]\s*(\d+)\s*(?:(s|sec)(?![a-z]))?(?:\s*@\s*(\d+(?:\.\d+)?)\s*(?:lbs?)?)?/gi;

/** Splits one line holding several "name NxM" entries (newlines lost somewhere) back into separate entries. */
function splitLine(line: string): string[] {
  const hits = [...line.matchAll(SET_PATTERN)];
  if (hits.length < 2) return [line];
  const out: string[] = [];
  let start = 0;
  for (const m of hits) {
    const end = (m.index ?? 0) + m[0].length;
    out.push(line.slice(start, end).trim());
    start = end;
  }
  const rest = line.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

function parseLine(line: string): Exercise {
  const m = /^(.*?)\s*(\d+)\s*[x×]\s*(\d+)\s*(?:(s|sec)(?![a-z]))?(?:\s*@\s*(\d+(?:\.\d+)?)\s*(?:lbs?)?)?\s*$/i.exec(line);
  if (!m || !m[1].trim()) return { name: line };
  const e: Exercise = { name: m[1].trim(), sets: Number(m[2]) };
  if (m[4]) e.seconds = Number(m[3]);
  else e.reps = Number(m[3]);
  if (m[5]) e.weight_lb = Number(m[5]);
  return e;
}

/** One exercise per line: "Back squat 4x6 @ 135", "Plank 3x45s", "Pull-ups 3x8", or just a name. Also recovers lines that got joined together. */
export function parseExercises(text: string): Exercise[] {
  const out: Exercise[] = [];
  for (const raw of text.split(/\r\n|\r|\n|\u2028|\u2029/)) {
    const line = raw.trim();
    if (!line) continue;
    for (const piece of splitLine(line)) out.push(parseLine(piece));
  }
  return out;
}

/** Validates exercises sent from the row editor (untrusted input). */
export function sanitizeExercises(input: unknown): Exercise[] {
  if (!Array.isArray(input)) return [];
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max ? v : undefined);
  const out: Exercise[] = [];
  for (const raw of input.slice(0, 60)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 120) : "";
    if (!name) continue;
    const e: Exercise = { name };
    const sets = num(r.sets, 50);
    const reps = num(r.reps, 1000);
    const seconds = num(r.seconds, 36000);
    const weight = num(r.weight_lb, 2000);
    const rest = num(r.rest_sec, 3600);
    if (sets) e.sets = Math.round(sets);
    if (seconds) e.seconds = Math.round(seconds);
    else if (reps) e.reps = Math.round(reps);
    if (weight) e.weight_lb = weight;
    if (rest) e.rest_sec = Math.round(rest);
    if (typeof r.note === "string" && r.note.trim()) e.note = r.note.trim().slice(0, 200);
    out.push(e);
  }
  return out;
}

/** Exercises from a form: the row editor's JSON when present, otherwise pasted text. */
export function exercisesFromForm(formData: FormData): Exercise[] {
  const json = String(formData.get("exercises_json") ?? "").trim();
  if (json) {
    try {
      return sanitizeExercises(JSON.parse(json));
    } catch {
      // fall through to text
    }
  }
  return parseExercises(String(formData.get("exercises") ?? ""));
}

/** True when a stored exercise name looks like several exercises glued together. */
export function looksMerged(name: string): boolean {
  return name.length > 45 || [...name.matchAll(SET_PATTERN)].length >= 1;
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

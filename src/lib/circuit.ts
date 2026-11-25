import type { Block, Exercise } from "./types";

export type Circuit = { exercises: Exercise[]; rounds: number; restSec: number | null };

const num = (s: string) => Number(s.replace(/,/g, ""));

/**
 * Turns a station block such as
 * "SkiErg 350 m, Sled push 15 m x2, Wall balls 20. Rest 90 s between rounds." (or its gym version,
 * "Heavy leg press 8 reps, heavy x2") into exercises, so each can be logged on its own.
 * Returns null when the block is not a "Round xN" list.
 */
export function parseCircuit(block: Block): Circuit | null {
  const rounds = /^round\s*x\s*(\d+)/i.exec(block.name.trim());
  if (!rounds) return null;
  const n = Number(rounds[1]);
  if (!(n >= 1 && n <= 20)) return null;
  const rest = /rest\s+(\d+)\s*s/i.exec(block.detail);
  const body = block.detail.replace(/\.?\s*rest\s+\d+\s*s[^.]*\.?/i, "").replace(/\.\s*$/, "");
  const exercises: Exercise[] = [];
  for (const raw of body.split(/,\s+/)) {
    const part = raw.trim();
    if (!part) continue;
    const times = /^(?:([a-z]+)\s+)?x(\d+)$/i.exec(part);
    if (times) {
      // "heavy x2" after an exercise: it is done that many times each round.
      const last = exercises[exercises.length - 1];
      if (last) {
        last.sets = (last.sets ?? n) * Number(times[2]);
        if (times[1]) last.note = last.note ? `${last.note}, ${times[1]}` : times[1];
      }
      continue;
    }
    const m = /^(.*?)\s+(\d[\d,]*(?:\.\d+)?)\s*(m|reps?)?(?:\s+x(\d+))?$/i.exec(part);
    if (m) {
      const metres = m[3]?.toLowerCase() === "m";
      exercises.push({
        name: m[1].trim(),
        sets: n * (m[4] ? Number(m[4]) : 1),
        reps: num(m[2]),
        ...(metres ? { unit: "m" as const } : {}),
        rest_sec: rest ? Number(rest[1]) : undefined,
      });
    } else if (exercises.length) {
      // A word or two with no number ("steady", "heavy"): a cue for the previous exercise.
      const last = exercises[exercises.length - 1];
      last.note = last.note ? `${last.note}, ${part}` : part;
    }
  }
  return exercises.length ? { exercises, rounds: n, restSec: rest ? Number(rest[1]) : null } : null;
}

/** The station block of a workout, when it has one. */
export function circuitOf(blocks: Block[] | undefined): Circuit | null {
  for (const b of blocks ?? []) {
    const c = parseCircuit(b);
    if (c) return c;
  }
  return null;
}

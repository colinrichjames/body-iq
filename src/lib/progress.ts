import type { WorkoutProgress } from "./types";

export type DraftLike = { logs: unknown[]; stepIndex: number; blockIndex: number; elapsedMs: number };

/** Elapsed time counts only while the player is open: saved base plus the current open stretch. */
export const elapsedMs = (base: number, segmentStart: number | null, now: number) => base + (segmentStart === null ? 0 : Math.max(0, now - segmentStart));

/** Chooses where to resume from: the server copy or this phone's draft, whichever has more progress. */
export function pickResume<T extends DraftLike>(server: T | null, local: T | null): T | null {
  if (!server) return local;
  if (!local) return server;
  const score = (d: DraftLike) => d.logs.length * 1_000_000_000 + d.blockIndex * 1_000_000 + d.elapsedMs;
  return score(local) > score(server) ? local : server;
}

/** Session has real progress worth keeping as "in progress". */
export const hasProgress = (p: { sets: number; blockIndex: number; elapsedMs: number }) => p.sets > 0 || p.blockIndex > 0 || p.elapsedMs >= 60_000;

export const progressLabel = (kind: "sets" | "blocks" | "timer", p: WorkoutProgress | null, doneSets: number, total: number) => {
  if (kind === "sets") return `${doneSets} of ${total} sets done`;
  if (kind === "blocks") return `${Math.min(p?.blockIndex ?? 0, total)} of ${total} blocks done`;
  return p ? `${Math.round(p.elapsedMs / 60000)} min in` : "";
};

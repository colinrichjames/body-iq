import { hyroxSplits, STATIONS } from "./hyrox";
import type { Step } from "./steps";
import type { Block } from "./types";

/** Dumbbell exercises log weight per hand, so the label says so. */
export const isDumbbell = (name: string) => /\b(dumbbells?|db|dbs)\b/i.test(name);

export type ExerciseOverview = { name: string; setsDone: number; totalSets: number; current: boolean };

/** Distinct exercises in the order they first appear, with how many of their sets are behind you. */
export function exerciseOverview(steps: Step[], stepIndex: number): { list: ExerciseOverview[]; position: number } {
  const names: string[] = [];
  for (const s of steps) if (!names.includes(s.exercise)) names.push(s.exercise);
  const cur = steps[stepIndex]?.exercise;
  const list = names.map((name) => {
    const own = steps.map((s, i) => ({ s, i })).filter((x) => x.s.exercise === name);
    return { name, setsDone: own.filter((x) => x.i < stepIndex).length, totalSets: own.length, current: name === cur };
  });
  return { list, position: Math.max(0, names.indexOf(cur ?? "")) + 1 };
}

/** "75s between sets, 120s before the next exercise" for one exercise on the detail page. */
export function restSummary(steps: Step[], exercise: string): string | null {
  const own = steps.filter((s) => s.exercise === exercise);
  if (!own.length) return null;
  const within = own.length > 1 ? own[0].restAfter : null;
  const last = own[own.length - 1].restAfter;
  const parts: string[] = [];
  if (within) parts.push(`rest ${within}s between sets`);
  if (last && last !== within) parts.push(`${last}s before the next exercise`);
  return parts.length ? parts.join(", ") : null;
}

const STATION_ALIASES: [RegExp, string][] = [
  [/ski/i, "skierg"],
  [/sled push/i, "sled_push"],
  [/sled pull/i, "sled_pull"],
  [/burpee/i, "burpee_broad_jump"],
  [/\brow/i, "row"],
  [/farmer/i, "farmers_carry"],
  [/sandbag|lunge/i, "sandbag_lunges"],
  [/wall ?ball/i, "wall_balls"],
];

/** Target seconds for each HYROX block name (Run 1..8 and the 8 stations) from the race goal time. */
export function hyroxBlockTargets(blocks: Block[], goalSec: number | null): Record<string, number> {
  if (!goalSec) return {};
  const { splits } = hyroxSplits(goalSec);
  const out: Record<string, number> = {};
  for (const b of blocks) {
    const run = /^run\s*(\d+)$/i.exec(b.name.trim());
    if (run) {
      const hit = splits.find((s) => s.kind === "run" && s.label.toLowerCase() === `run ${run[1]}`);
      if (hit) out[b.name] = hit.sec;
      continue;
    }
    const key = STATION_ALIASES.find(([re]) => re.test(b.name))?.[1];
    const hit = key ? splits.find((s) => s.key === key) : undefined;
    if (hit && STATIONS.some((s) => s.key === key)) out[b.name] = hit.sec;
  }
  return out;
}

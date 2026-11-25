import type { Block, WorkoutStructure } from "./types";

/**
 * Hyrox stations that need special equipment, with a classic-gym replacement. The replacement keeps the training
 * effect (muscles, intensity) rather than copying the movement, and the amount is converted from metres.
 */
type Station = {
  id: string;
  /** Hyrox name as it appears in plans. */
  hyrox: string;
  test: RegExp;
  /** Gym replacement name. */
  gym: string;
  /** Converts the Hyrox amount (m or reps) into the replacement's amount text. */
  amount: (n: number) => string;
  /** Why this swap, and other options if your gym is different. */
  why: string;
  alts: string[];
};

const r5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
/** Heavy sled work is short and hard: about half the metres in reps, never fewer than 8. */
const heavyReps = (m: number) => Math.max(8, Math.round(m / 2));

export const STATIONS: Station[] = [
  {
    id: "skierg",
    hyrox: "SkiErg",
    test: /ski\s?-?erg/i,
    gym: "Straight-arm cable pulldowns",
    amount: (m) => `${r5(m / 10)} reps, steady`,
    why: "Same lats, triceps and core pull from overhead. Keep arms long and hips hinged.",
    alts: ["Rope or bar on a high cable", "Lat pulldown, fast and light", "Rowing machine at a steady pace"],
  },
  {
    id: "sled_push",
    hyrox: "Sled push",
    test: /sled\s*push/i,
    gym: "Heavy leg press",
    amount: (m) => `${heavyReps(m)} reps, heavy`,
    why: "Drives the same quads and glutes under load. Go heavier than a normal set and keep moving.",
    alts: ["Heavy dumbbell walking lunges", "Treadmill incline walk, 12 to 15%", "Smith machine split squats"],
  },
  {
    id: "sled_pull",
    hyrox: "Sled pull",
    test: /sled\s*pull/i,
    gym: "Heavy seated cable row",
    amount: (m) => `${heavyReps(m)} reps, heavy`,
    why: "Hamstrings, back and grip pulling a load toward you.",
    alts: ["Cable pull-through", "Inverted row on a Smith bar", "Heavy dumbbell row"],
  },
  {
    id: "sandbag_lunges",
    hyrox: "Sandbag lunges",
    test: /sand\s?bag\s*lunges?/i,
    gym: "Dumbbell walking lunges",
    amount: (m) => `${r5(m)} m`,
    why: "Same movement; hold the dumbbells at your sides or a barbell on your front shoulders.",
    alts: ["Barbell front-rack lunges", "Goblet lunges with one heavy dumbbell"],
  },
  {
    id: "wall_balls",
    hyrox: "Wall balls",
    test: /wall\s?balls?/i,
    gym: "Dumbbell thrusters",
    amount: (n) => `${r5(n)} reps`,
    why: "Squat into an overhead press, the same pattern. Use a light to moderate pair.",
    alts: ["Medicine ball squat throws to the floor", "Goblet squat to press", "Barbell thrusters, empty bar"],
  },
];

/** Stations that already work in a normal gym: no swap, listed so you know they stay. */
export const GYM_READY = ["Burpee broad jumps", "Farmers carry (dumbbells or kettlebells)", "Rowing (machine) or air bike", "Runs (treadmill is fine)"];

const NUM = String.raw`(\d{1,3}(?:,\d{3})*|\d+)`;
const toNum = (s: string) => Number(s.replace(/,/g, ""));

/** Rewrites station mentions inside free text, e.g. "Sled push 25 m x2" becomes "Heavy leg press 10 reps, heavy x2". */
export function swapText(text: string): string {
  let out = text;
  for (const st of STATIONS) {
    const re = new RegExp(`(${st.test.source})\\s*${NUM}\\s*(m|reps?)?`, "gi");
    out = out.replace(re, (_all, _name, num) => `${st.gym} ${st.amount(toNum(num))}`);
  }
  return out;
}

/** Swaps one block. Returns the same block when it has no special-equipment station. */
export function swapBlock(b: Block): Block {
  if (b.original) return b;
  const st = STATIONS.find((s) => s.test.test(b.name));
  if (st) {
    const m = b.detail.match(new RegExp(`${NUM}\\s*(?:m|reps?)?`, "i"));
    const amount = m ? st.amount(toNum(m[1])) : "";
    return { ...b, name: st.gym, detail: amount ? `${amount} (replaces ${st.hyrox}).` : `Replaces ${st.hyrox}.`, original: { name: b.name, detail: b.detail } };
  }
  const detail = swapText(b.detail);
  return detail === b.detail ? b : { ...b, detail, original: { name: b.name, detail: b.detail } };
}

export const revertBlock = (b: Block): Block => {
  if (!b.original) return b;
  const { original, ...rest } = b;
  return { ...rest, name: original.name, detail: original.detail };
};

export const isSwapped = (s: WorkoutStructure | null | undefined) => !!s?.blocks?.some((b) => b.original);

export function swapStructure(s: WorkoutStructure): WorkoutStructure {
  return s.blocks ? { ...s, blocks: s.blocks.map(swapBlock) } : s;
}
export function revertStructure(s: WorkoutStructure): WorkoutStructure {
  return s.blocks ? { ...s, blocks: s.blocks.map(revertBlock) } : s;
}

/** Stations in this session that need special equipment (from the original text, whether or not it is swapped now). */
export function stationsIn(s: WorkoutStructure | null | undefined): Station[] {
  const text = (s?.blocks ?? []).map((b) => `${b.original?.name ?? b.name} ${b.original?.detail ?? b.detail}`).join(" ");
  return STATIONS.filter((st) => st.test.test(text));
}

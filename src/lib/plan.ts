import { addDays, diffDays, startOfWeek } from "./dates";
import type { Block, RaceType, Sport, WorkoutStructure } from "./types";

export type Phase = "base" | "build" | "peak" | "taper";
type Family = "run" | "tri" | "hyrox";

export const RACE_TYPES: { value: RaceType; label: string; family: Family }[] = [
  { value: "marathon", label: "Marathon", family: "run" },
  { value: "half_marathon", label: "Half marathon", family: "run" },
  { value: "10k", label: "10K", family: "run" },
  { value: "5k", label: "5K", family: "run" },
  { value: "triathlon_sprint", label: "Triathlon: Sprint", family: "tri" },
  { value: "triathlon_olympic", label: "Triathlon: Olympic", family: "tri" },
  { value: "triathlon_70_3", label: "Triathlon: 70.3", family: "tri" },
  { value: "triathlon_140_6", label: "Triathlon: Full Ironman", family: "tri" },
  { value: "hyrox_single", label: "Hyrox: Singles", family: "hyrox" },
  { value: "hyrox_doubles", label: "Hyrox: Doubles", family: "hyrox" },
];

export function raceLabel(type: RaceType): string {
  return RACE_TYPES.find((r) => r.value === type)?.label ?? type;
}

function familyOf(type: RaceType): Family {
  return RACE_TYPES.find((r) => r.value === type)!.family;
}

/** Peak-week minutes per session type, plus how many weeks of taper the race wants. */
const PEAKS: Record<
  RaceType,
  { longRun: number; longBike: number; brickRun: number; swim: number; taperWeeks: number }
> = {
  marathon: { longRun: 180, longBike: 90, brickRun: 0, swim: 0, taperWeeks: 2 },
  half_marathon: { longRun: 120, longBike: 75, brickRun: 0, swim: 0, taperWeeks: 1 },
  "10k": { longRun: 90, longBike: 60, brickRun: 0, swim: 0, taperWeeks: 1 },
  "5k": { longRun: 75, longBike: 60, brickRun: 0, swim: 0, taperWeeks: 1 },
  triathlon_sprint: { longRun: 50, longBike: 75, brickRun: 15, swim: 40, taperWeeks: 1 },
  triathlon_olympic: { longRun: 70, longBike: 105, brickRun: 20, swim: 50, taperWeeks: 1 },
  triathlon_70_3: { longRun: 90, longBike: 180, brickRun: 30, swim: 60, taperWeeks: 2 },
  triathlon_140_6: { longRun: 120, longBike: 300, brickRun: 45, swim: 75, taperWeeks: 3 },
  hyrox_single: { longRun: 60, longBike: 60, brickRun: 0, swim: 0, taperWeeks: 2 },
  hyrox_doubles: { longRun: 60, longBike: 60, brickRun: 0, swim: 0, taperWeeks: 2 },
};

export type WeekPlan = { weekStart: string; phase: Phase; factor: number; isRaceWeek: boolean; /** Why this week differs, e.g. another race or the recovery after it. */ note?: string };

/** Another upcoming race this plan has to work around. */
export type OtherRace = { name: string; date: string; priority: "A" | "B" | "C" };

/** Share of normal volume in the week of another race and in the week after it, by that race's priority. */
const OTHER_RACE_WEEK: Record<"A" | "B" | "C", { during: number; after: number }> = {
  A: { during: 0.5, after: 0.6 },
  B: { during: 0.7, after: 0.8 },
  C: { during: 0.85, after: 0.9 },
};

const TAPER_FACTORS: Record<number, number[]> = {
  1: [0.4],
  2: [0.6, 0.4],
  3: [0.75, 0.55, 0.4],
};

function taperFactors(weeks: number): number[] {
  if (weeks <= 0) return [];
  if (TAPER_FACTORS[weeks]) return TAPER_FACTORS[weeks];
  return [...Array(weeks - 3).fill(0.85), ...TAPER_FACTORS[3]];
}

/** Calendar weeks (Mon-Sun) from the start date through race week, with phase and volume factor. */
export function planWeeks(raceType: RaceType, startDate: string, raceDate: string, taperOverride?: number, others: OtherRace[] = []): WeekPlan[] {
  if (diffDays(startDate, raceDate) < 0) throw new Error("Race date must be today or later.");

  const first = startOfWeek(startDate);
  const raceWeek = startOfWeek(raceDate);
  const total = diffDays(first, raceWeek) / 7 + 1;
  const taperTotal = Math.min(taperOverride ?? PEAKS[raceType].taperWeeks, total);
  const training = total - taperTotal;

  const peakWeeks = training >= 5 ? Math.max(1, Math.floor(training * 0.2)) : 0;
  const baseWeeks = training >= 3 ? Math.floor(training * 0.4) : 0;
  const buildWeeks = training - baseWeeks - peakWeeks;

  const weeks: WeekPlan[] = [];
  for (let i = 0; i < training; i++) {
    const phase: Phase = i < baseWeeks ? "base" : i < baseWeeks + buildWeeks ? "build" : "peak";
    let factor = 0.65 + 0.35 * (training > 1 ? i / (training - 1) : 1);
    if (training >= 5 && (i + 1) % 4 === 0) factor *= 0.8; // deload week
    weeks.push({ weekStart: addDays(first, i * 7), phase, factor, isRaceWeek: false });
  }
  const tf = taperFactors(taperTotal);
  for (let j = 0; j < taperTotal; j++) {
    weeks.push({
      weekStart: addDays(first, (training + j) * 7),
      phase: "taper",
      factor: tf[j],
      isRaceWeek: j === taperTotal - 1,
    });
  }
  // Build around the user's other races: a lighter week for the race itself, then recovery after it.
  for (const o of others) {
    if (o.date === raceDate) continue;
    for (const w of weeks) {
      if (w.isRaceWeek) continue;
      const end = addDays(w.weekStart, 6);
      const k = OTHER_RACE_WEEK[o.priority];
      if (o.date >= w.weekStart && o.date <= end) {
        w.factor *= k.during;
        w.note = `Race this week: ${o.name} (${o.priority})`;
      } else if (o.date >= addDays(w.weekStart, -7) && o.date < w.weekStart) {
        w.factor *= k.after;
        w.note = w.note ?? `Recovery after ${o.name} (${o.priority})`;
      }
    }
  }
  return weeks;
}

/** Which phase the athlete is in today for a given race. */
export function currentPhase(raceType: RaceType, raceDate: string, today: string): Phase | null {
  if (diffDays(today, raceDate) < 0) return null;
  return planWeeks(raceType, today, raceDate)[0].phase;
}

export type PlannedWorkout = {
  workout_date: string;
  sport: Sport;
  title: string;
  description: string;
  planned_duration_min: number | null;
  structure: WorkoutStructure | null;
};

type Draft = Omit<PlannedWorkout, "workout_date">;
type Ctx = { phase: Phase; f: number; type: RaceType; family: Family };

const mins = (peak: number, f: number, floor = 20) => Math.max(floor, Math.round((peak * f) / 5) * 5);

// ---------------------------------------------------------------------------
// Strength library (circuit and straight-set sessions)
// ---------------------------------------------------------------------------
const STRENGTH: Record<
  "fullA" | "push" | "pull" | "legs",
  { title: string; description: string; duration: number; structure: WorkoutStructure }
> = {
  fullA: {
    title: "Strength: Full Body A (circuit)",
    description: "Circuit: do every exercise in order with no rest, then rest between rounds.",
    duration: 45,
    structure: {
      rounds: 3,
      rest_sec: 90,
      exercises: [
        { name: "Goblet Squat", reps: 12 },
        { name: "Push-up", reps: 12 },
        { name: "Bent-Over Row (dumbbell)", reps: 12 },
        { name: "Romanian Deadlift", reps: 10 },
        { name: "Plank", seconds: 30 },
      ],
    },
  },
  push: {
    title: "Strength: Push",
    description: "Straight sets, 4 x 12. Strength comes before any cardio.",
    duration: 50,
    structure: {
      rest_sec: 75,
      exercises: [
        { name: "Dumbbell Bench Press", sets: 4, reps: 12 },
        { name: "Dumbbell Fly", sets: 4, reps: 12 },
        { name: "Tricep Extension", sets: 4, reps: 12 },
        { name: "Rope Pulldown", sets: 4, reps: 12 },
      ],
    },
  },
  pull: {
    title: "Strength: Pull",
    description: "Straight sets, 4 x 12. Strength comes before any cardio.",
    duration: 50,
    structure: {
      rest_sec: 75,
      exercises: [
        { name: "Lat Pulldown", sets: 4, reps: 12 },
        { name: "Seated Row", sets: 4, reps: 12 },
        { name: "Dumbbell Row", sets: 4, reps: 12 },
        { name: "Preacher Curl", sets: 4, reps: 12 },
      ],
    },
  },
  legs: {
    title: "Strength: Legs",
    description: "Straight sets. Keep form strict; stop 1-2 reps short of failure.",
    duration: 50,
    structure: {
      rest_sec: 90,
      exercises: [
        { name: "Back Squat", sets: 4, reps: 10 },
        { name: "Romanian Deadlift", sets: 4, reps: 10 },
        { name: "Walking Lunge", sets: 3, reps: 12, note: "per leg" },
        { name: "Lateral Lunge", sets: 3, reps: 10, note: "per leg" },
        { name: "Lying Leg Curl", sets: 3, reps: 12 },
        { name: "Standing Calf Raise", sets: 3, reps: 15 },
      ],
    },
  },
};

function strength(key: keyof typeof STRENGTH, ctx: Ctx): Draft {
  const s = STRENGTH[key];
  const light = ctx.phase === "taper";
  const structure: WorkoutStructure = JSON.parse(JSON.stringify(s.structure));
  if (light) {
    if (structure.rounds) structure.rounds = 2;
    structure.exercises?.forEach((e) => {
      if (e.sets) e.sets = Math.min(e.sets, 2);
    });
  }
  return {
    sport: "strength",
    title: light ? `${s.title} (light)` : s.title,
    description: light ? "Taper week: keep it light, leave fresh legs for race day." : s.description,
    planned_duration_min: light ? Math.round(s.duration * 0.7) : s.duration,
    structure,
  };
}

// ---------------------------------------------------------------------------
// Cardio helpers
// ---------------------------------------------------------------------------
function cardio(sport: Sport, title: string, dur: number, mainName: string, mainDetail: string, warmCool = true): Draft {
  const wc = warmCool ? (dur >= 40 ? 10 : 5) : 0;
  const blocks: Block[] = [];
  if (wc) blocks.push({ name: "Warm-up", detail: "Easy effort, build gradually.", minutes: wc });
  blocks.push({ name: mainName, detail: mainDetail, minutes: dur - wc * 2 });
  if (wc) blocks.push({ name: "Cool-down", detail: "Easy effort, then stretch.", minutes: wc });
  return { sport, title, description: mainDetail, planned_duration_min: dur, structure: { blocks } };
}

const RUN_QUALITY: Record<Phase, { title: string; detail: string }> = {
  base: { title: "Run: Easy + strides", detail: "Easy aerobic run at conversational pace (Zone 2), then 4-6 x 20 s strides." },
  build: { title: "Run: Tempo", detail: "20-30 min at threshold effort (comfortably hard) inside the run." },
  peak: { title: "Run: Race-pace intervals", detail: "4-6 x 1 km at goal race pace with 2 min easy jog between." },
  taper: { title: "Run: Sharpener", detail: "Short and crisp: 4 x 1 min at race pace with full easy recovery." },
};

const BIKE_INTERVALS: Record<Phase, string> = {
  base: "Steady Zone 2 with 3 x 5 min cadence drills (100+ rpm).",
  build: "4 x 8 min at sweet-spot effort with 4 min easy between.",
  peak: "3 x 12 min at race effort with 5 min easy between.",
  taper: "Easy spin with 4 x 1 min openers at race effort.",
};

const SWIM_SETS: Record<Phase, string> = {
  base: "Drills 4 x 50 m, then 6 x 200 m steady with 20 s rest.",
  build: "8 x 150 m at threshold with 15 s rest.",
  peak: "4 x 400 m at race pace, sighting every 8 strokes.",
  taper: "Easy 400 m, then 4 x 100 m fast with full rest.",
};

function longRun(ctx: Ctx): Draft {
  const dur = mins(PEAKS[ctx.type].longRun, ctx.f, 30);
  return cardio(
    "run",
    "Run: Long",
    dur,
    "Long run",
    "Steady Zone 2. Take carbs and sodium every 40-45 min and rehearse race-day fueling.",
    false,
  );
}

// ---------------------------------------------------------------------------
// Hyrox sessions
// ---------------------------------------------------------------------------
const round = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

function hyroxStations(ctx: Ctx): Draft {
  const s = Math.min(1, Math.max(0.4, ctx.f));
  const blocks: Block[] = [
    { name: "Warm-up", detail: "5 min row or ski easy, then dynamic mobility.", minutes: 10 },
    {
      name: "Round x3",
      detail: `SkiErg ${round(500 * s, 50)} m, Sled push ${round(25 * s, 5)} m x2, Burpee broad jumps ${round(40 * s, 5)} m, Row ${round(500 * s, 50)} m, Farmers carry ${round(100 * s, 10)} m, Wall balls ${round(30 * s, 5)}. Rest 60 s between rounds.`,
      minutes: 35,
    },
    { name: "Cool-down", detail: "Walk, then stretch hips and shoulders.", minutes: 5 },
  ];
  return {
    sport: "hyrox",
    title: "Hyrox: Station skills",
    description: "Practice station technique under fatigue. Smooth beats fast.",
    planned_duration_min: 50,
    structure: { blocks },
  };
}

function hyroxSim(ctx: Ctx): Draft {
  const s = Math.min(1, Math.max(0.4, ctx.f));
  const stations: [string, string][] = [
    ["SkiErg", `${round(1000 * s, 50)} m`],
    ["Sled push", `${s < 0.6 ? 25 : 50} m`],
    ["Sled pull", `${s < 0.6 ? 25 : 50} m`],
    ["Burpee broad jumps", `${round(80 * s, 5)} m`],
    ["Rowing", `${round(1000 * s, 50)} m`],
    ["Farmers carry", `${round(200 * s, 10)} m`],
    ["Sandbag lunges", `${round(100 * s, 10)} m`],
    ["Wall balls", `${round(100 * s, 5)} reps`],
  ];
  const doubles = ctx.type === "hyrox_doubles";
  const blocks: Block[] = [{ name: "Warm-up", detail: "10 min easy plus 3 x 20 s strides.", minutes: 10 }];
  stations.forEach(([name, amount], i) => {
    blocks.push({ name: `Run ${i + 1}`, detail: "1 km at target race pace." });
    blocks.push({
      name: name,
      detail: doubles ? `${amount}, split with your partner, practice the hand-offs.` : amount,
    });
  });
  return {
    sport: "hyrox",
    title: "Hyrox: Simulation",
    description: `Run-plus-station simulation at ${Math.round(s * 100)}% of race volume. Hold even pacing.`,
    planned_duration_min: mins(80, ctx.f, 30),
    structure: { blocks },
  };
}

// ---------------------------------------------------------------------------
// Weekly templates (Monday = 0 ... Sunday = 6). Strength always comes first in
// the week's rhythm; Sunday is a rest day except for the triathlon long run.
// ---------------------------------------------------------------------------
function sessionsFor(dow: number, ctx: Ctx): Draft[] {
  const { phase, f, type, family } = ctx;
  const rq = RUN_QUALITY[phase];

  if (family === "run") {
    switch (dow) {
      case 0: return [strength("fullA", ctx)];
      case 1: return [cardio("run", rq.title, mins(50, f), "Main set", rq.detail)];
      case 2: return [cardio("bike", "Bike: Easy Zone 2", mins(60, f), "Zone 2 spin", "Steady cadence 85-95 rpm, nose-breathing effort.")];
      case 3: return [strength("push", ctx), strength("pull", ctx)].slice(0, phase === "taper" ? 1 : 2);
      case 4: return [cardio("run", "Run: Easy", mins(40, f), "Easy run", "Conversational pace, relaxed form.")];
      case 5: return [longRun(ctx)];
      default: return [];
    }
  }

  if (family === "hyrox") {
    switch (dow) {
      case 0: return [strength("fullA", ctx)];
      case 1: return [cardio("run", "Run: 1 km repeats", mins(45, f), "Repeats", "5-8 x 1 km at Hyrox run pace with 90 s walk-jog recovery.")];
      case 2: return [hyroxStations(ctx)];
      case 3: return [strength("push", ctx), strength("legs", ctx)].slice(0, phase === "taper" ? 1 : 2);
      case 4: return [cardio("bike", "Bike: Easy Zone 2", mins(45, f), "Zone 2 spin", "Easy aerobic spin to flush the legs.")];
      case 5: return [hyroxSim(ctx)];
      default: return [];
    }
  }

  // Triathlon
  const p = PEAKS[type];
  switch (dow) {
    case 0: return [strength("fullA", ctx)];
    case 1: return [cardio("swim", "Swim: Main set", mins(p.swim, f), "Main set", SWIM_SETS[phase])];
    case 2: return [cardio("run", rq.title, mins(50, f), "Main set", rq.detail)];
    case 3: return [cardio("bike", "Bike: Intervals", mins(Math.max(60, p.longBike * 0.5), f), "Intervals", BIKE_INTERVALS[phase])];
    case 4: return [];
    case 5: {
      const out = [
        cardio("bike", "Bike: Long", mins(p.longBike, f, 45), "Long ride", "Steady Zone 2. Practice race nutrition every 20-30 min.", false),
      ];
      if (p.brickRun > 0) {
        out.push(
          cardio("run", "Brick run (off the bike)", mins(p.brickRun, f, 10), "Brick run", "Start easy for 5 min, then settle to race effort.", false),
        );
      }
      return out;
    }
    case 6: return [longRun(ctx)];
    default: return [];
  }
}

/** Which weekdays (Monday = 0 ... Sunday = 6) the user can train, and which day gets the long session. */
export type TrainingPrefs = { days: number[]; longDay: number };

/**
 * Re-lays one template week (7 days of sessions, Monday first) onto the user's available days. The long session
 * goes on `longDay` (a triathlon's long run on the next available day), the other sessions fill the remaining
 * available days in their usual order, and if there are more sessions than days the last ones are dropped.
 * Spacing hard and easy days is not re-checked, so the user's choice of days is respected as given.
 */
export function layoutWeek(template: Draft[][], prefs: TrainingPrefs, family: Family): Draft[][] {
  const days = [...new Set(prefs.days.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (!days.length) return template;
  const longDay = days.includes(prefs.longDay) ? prefs.longDay : days[days.length - 1];
  const out: Draft[][] = Array.from({ length: 7 }, () => []);
  const longIdx = family === "tri" ? [5, 6] : [5];
  const free = days.filter((d) => d !== longDay);

  if (template[5]?.length) out[longDay] = template[5];
  if (family === "tri" && template[6]?.length) {
    const after = [...days.filter((d) => d > longDay), ...days.filter((d) => d < longDay)].find((d) => d !== longDay);
    if (after !== undefined) {
      out[after] = template[6];
      free.splice(free.indexOf(after), 1);
    }
  }
  const regular = template.map((d, i) => ({ d, i })).filter((x) => !longIdx.includes(x.i) && x.d.length > 0);
  regular.slice(0, free.length).forEach((x, n) => {
    out[free[n]] = x.d;
  });
  return out;
}

/**
 * One session a day, except a triathlon brick (bike then run on purpose). A second session on a day is moved to the
 * next free training day later in the week, or earlier if none is left. If the week has no free training day, the
 * extra is dropped, the same as layoutWeek does when there are more sessions than days.
 */
export function spreadWeek(week: Draft[][], allowedDays: number[] = [0, 1, 2, 3, 4, 5, 6]): Draft[][] {
  const out = week.map((d) => [...d]);
  const valid = [...new Set(allowedDays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  const allowed = valid.length ? valid : [0, 1, 2, 3, 4, 5, 6];
  for (let dow = 0; dow < 7; dow++) {
    if (out[dow].length < 2 || out[dow].some((d) => d.title.startsWith("Brick"))) continue;
    const [first, ...extras] = out[dow];
    out[dow] = [first];
    for (const extra of extras) {
      const target = [...allowed.filter((d) => d > dow), ...allowed.filter((d) => d < dow).reverse()].find((d) => out[d].length === 0);
      if (target !== undefined) out[target] = [extra];
    }
  }
  return out;
}

/** Dates that hold more than one session, ignoring a deliberate brick. Used as a self-check before a plan is saved. */
export function findDoubleBookings(plan: { workout_date: string; title: string }[]): string[] {
  const byDay = new Map<string, string[]>();
  for (const w of plan) byDay.set(w.workout_date, [...(byDay.get(w.workout_date) ?? []), w.title]);
  return [...byDay].filter(([, t]) => t.length > 1 && !t.some((x) => x.startsWith("Brick"))).map(([d]) => d).sort();
}

function raceDay(type: RaceType, name: string): Draft {
  const fam = familyOf(type);
  return {
    sport: fam === "run" ? "run" : fam === "hyrox" ? "hyrox" : "other",
    title: `RACE DAY: ${name}`,
    description: "Trust the training. Fuel early, start controlled, and race the second half.",
    planned_duration_min: null,
    structure: null,
  };
}

function shakeout(family: Family): Draft {
  return cardio(
    "run",
    "Shakeout",
    family === "tri" ? 25 : 20,
    "Shakeout",
    family === "tri" ? "15 min easy swim or spin, then 10 min easy jog with 4 strides." : "15-20 min very easy with 4 strides. Lay out race kit.",
    false,
  );
}

export function generatePlan(opts: {
  raceType: RaceType;
  raceName: string;
  raceDate: string;
  startDate: string;
  /** Only A races get a full taper. B and C races get a one-week reduction so they don't wreck the A-race build. */
  priority?: "A" | "B" | "C";
  /** The user's training days and long-session day. Without it the default weekly template is used. */
  prefs?: TrainingPrefs | null;
  /** Other upcoming races to work around. */
  others?: OtherRace[];
}): PlannedWorkout[] {
  const { raceType, raceName, raceDate, startDate } = opts;
  const taperOverride = opts.priority && opts.priority !== "A" ? 1 : undefined;
  const family = familyOf(raceType);
  const out: PlannedWorkout[] = [];

  for (const week of planWeeks(raceType, startDate, raceDate, taperOverride, opts.others ?? [])) {
    const template = Array.from({ length: 7 }, (_, dow) => sessionsFor(dow, { phase: week.phase, f: week.factor, type: raceType, family }));
    const laid = opts.prefs ? layoutWeek(template, opts.prefs, family) : template;
    const laidOut = spreadWeek(laid, opts.prefs?.days);
    for (let dow = 0; dow < 7; dow++) {
      const date = addDays(week.weekStart, dow);
      if (date < startDate || date > raceDate) continue;

      let drafts: Draft[];
      if (date === raceDate) drafts = [raceDay(raceType, raceName)];
      else if (date === addDays(raceDate, -1)) drafts = [shakeout(family)];
      else if (date === addDays(raceDate, -2)) drafts = []; // rest
      else drafts = laidOut[dow];

      for (const d of drafts) out.push({ workout_date: date, ...d });
    }
  }
  return out;
}

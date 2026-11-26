import type { GoalMode } from "./coach";
import type { Profile } from "./types";

export type GoalType = "lose_weight" | "lose_fat" | "build_muscle" | "maintain" | "performance" | "gain_weight";

type Goal = {
  label: string;
  blurb: string;
  /** Calorie direction the weekly coach works with. */
  mode: GoalMode;
  /** Default pace in lb per week; null when the goal holds weight. */
  rate: number | null;
  /** Protein range in g per kg of body weight. */
  protein: [number, number];
  training: string;
  fuel: string;
};

export const GOALS: Record<GoalType, Goal> = {
  lose_weight: {
    label: "Lose weight",
    blurb: "Drop body weight at a steady pace.",
    mode: "lose",
    rate: 1,
    protein: [1.6, 2.2],
    training: "Lift 2-3 days a week to hold on to muscle, and add easy cardio and daily walking.",
    fuel: "A modest daily deficit. The coach trims calories if your weight trend is slower than your pace.",
  },
  lose_fat: {
    label: "Lose fat",
    blurb: "Lose fat while keeping as much muscle as you can.",
    mode: "lose",
    rate: 0.75,
    protein: [2, 2.4],
    training: "Lift heavy 3-4 days a week and keep most cardio easy so recovery stays good.",
    fuel: "A smaller deficit than a pure weight-loss goal, with protein at the high end. Compare body scans, not just the scale.",
  },
  build_muscle: {
    label: "Build muscle",
    blurb: "Gain lean mass with a small surplus.",
    mode: "gain",
    rate: 0.25,
    protein: [1.6, 2.2],
    training: "Lift 3-5 days a week and add weight or reps over time. Keep hard cardio from eating into recovery.",
    fuel: "A small surplus, around a quarter pound a week, so most of the gain is muscle.",
  },
  maintain: {
    label: "Maintain",
    blurb: "Hold your weight and keep your fitness.",
    mode: "maintain",
    rate: null,
    protein: [1.4, 2],
    training: "Keep a steady mix of lifting and cardio you can sustain.",
    fuel: "Eat near maintenance. The coach only nudges calories if your weight drifts.",
  },
  performance: {
    label: "Performance",
    blurb: "Fuel races and hard training.",
    mode: "maintain",
    rate: null,
    protein: [1.4, 1.8],
    training: "Balance hard and easy days and keep one rest day. Race plans set the session mix.",
    fuel: "Carbs rise with the day's work, so eat enough around long and hard sessions rather than cutting.",
  },
  gain_weight: {
    label: "Gain weight",
    blurb: "Add body weight.",
    mode: "gain",
    rate: 0.5,
    protein: [1.4, 2],
    training: "Lift 3-4 days a week and keep cardio moderate so the extra calories go to gaining.",
    fuel: "A steady surplus with calorie-dense foods and regular meals.",
  },
};

export const GOAL_TYPES = Object.keys(GOALS) as GoalType[];
export const isGoalType = (v: unknown): v is GoalType => typeof v === "string" && v in GOALS;

/** The goal in use: the chosen one, or the older lose/maintain/gain setting mapped across. */
export function goalOf(p: Pick<Profile, "goal_type" | "goal_mode"> | null): GoalType | null {
  if (!p) return null;
  if (isGoalType(p.goal_type)) return p.goal_type;
  return p.goal_mode === "lose" ? "lose_weight" : p.goal_mode === "gain" ? "gain_weight" : p.goal_mode === "maintain" ? "maintain" : null;
}

export type GoalPlan = { summary: string; tips: string[] };

/** What the app recommends for a goal, with protein worked out in grams when weight is known. */
export function goalPlan(goal: GoalType, weightLb: number | null, proteinTarget: number | null): GoalPlan {
  const g = GOALS[goal];
  const tips: string[] = [];
  if (weightLb && weightLb > 0) {
    const kg = weightLb * 0.45359237;
    const lo = Math.round(kg * g.protein[0]);
    const hi = Math.round(kg * g.protein[1]);
    tips.push(`Protein: aim for ${lo}-${hi} g a day.`);
    if (proteinTarget && proteinTarget < lo) tips.push(`Your protein target (${proteinTarget} g) is below that range. Consider raising it in Settings.`);
  } else {
    tips.push(`Protein: aim for ${g.protein[0]}-${g.protein[1]} g per kg of body weight. Log a weigh-in to see grams.`);
  }
  tips.push(g.fuel, g.training);
  return { summary: g.blurb, tips };
}

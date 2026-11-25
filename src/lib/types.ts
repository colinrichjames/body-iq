export type ScanSource = "inbody" | "dexa" | "scale" | "manual";

export type BodyScan = {
  id: string;
  user_id: string;
  scanned_at: string;
  source: ScanSource;
  weight_lb: number | null;
  body_fat_pct: number | null;
  skeletal_muscle_lb: number | null;
  fat_mass_lb: number | null;
  notes: string | null;
  created_at: string;
};

export type RaceType =
  | "marathon"
  | "half_marathon"
  | "10k"
  | "5k"
  | "triathlon_sprint"
  | "triathlon_olympic"
  | "triathlon_70_3"
  | "triathlon_140_6"
  | "hyrox_single"
  | "hyrox_doubles";

export type Race = {
  id: string;
  user_id: string;
  name: string;
  race_type: RaceType;
  race_date: string;
  location: string | null;
  goal: string | null;
  priority: "A" | "B" | "C";
  goal_time_sec: number | null;
  created_at: string;
};

export type Sport = "strength" | "run" | "bike" | "swim" | "hyrox" | "mobility" | "other";
export type WorkoutStatus = "planned" | "in_progress" | "completed" | "skipped";

/** Where a half-finished session stands. elapsedMs only counts time the player was open. */
export type WorkoutProgress = { stepIndex: number; blockIndex: number; elapsedMs: number; updatedAt: string };

export type Exercise = {
  name: string;
  sets?: number;
  reps?: number;
  /** Timed hold, e.g. a plank. Logged as seconds. */
  seconds?: number;
  weight_lb?: number;
  rest_sec?: number;
  note?: string;
};

export type Block = {
  name: string;
  detail: string;
  minutes?: number;
};

export type WorkoutStructure = {
  exercises?: Exercise[];
  /** When set, exercises run as a circuit: all exercises in order, rest only between rounds. */
  rounds?: number;
  /** Rest between rounds (circuit) or sets (straight sets) when an exercise has no rest_sec. */
  rest_sec?: number;
  blocks?: Block[];
};

export type Workout = {
  id: string;
  user_id: string;
  workout_date: string;
  sport: Sport;
  title: string;
  description: string | null;
  planned_duration_min: number | null;
  structure: WorkoutStructure | null;
  status: WorkoutStatus;
  progress: WorkoutProgress | null;
  race_id: string | null;
  generated: boolean;
  actual_duration_min: number | null;
  actual_distance_km: number | null;
  avg_hr: number | null;
  avg_power: number | null;
  activity_id: string | null;
  rpe: number | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
};

export type WorkoutSet = {
  id: string;
  user_id: string;
  workout_id: string;
  exercise: string;
  set_number: number;
  reps: number | null;
  weight_lb: number | null;
  rpe: number | null;
  created_at: string;
};

export type NutritionDay = {
  user_id: string;
  day: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  sodium_mg: number | null;
  sugar_g: number | null;
  fiber_g: number | null;
  source: string;
};

export type Profile = {
  id: string;
  display_name: string | null;
  unit_system: "imperial" | "metric";
  calorie_target: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  rest_calorie_target: number | null;
  rest_protein_g: number | null;
  rest_carbs_g: number | null;
  rest_fat_g: number | null;
};

export type HyroxBenchmark = {
  id: string;
  user_id: string;
  station: string;
  effort_date: string;
  time_sec: number;
  notes: string | null;
};

export type DailyHealth = {
  user_id: string;
  day: string;
  sleep_seconds: number | null;
  sleep_score: number | null;
  hrv_ms: number | null;
  resting_hr: number | null;
  body_battery_max: number | null;
  body_battery_min: number | null;
  stress_avg: number | null;
  steps: number | null;
};

export type SyncRun = {
  id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "error";
  items: number | null;
  error: string | null;
  detail: { endpoints?: { name: string; status: number | string; count?: number }[] } | null;
};

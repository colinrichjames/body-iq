import type { Sport } from "./types";

export const SPORT_DOT: Record<string, string> = {
  run: "bg-sky-400",
  bike: "bg-amber-400",
  swim: "bg-cyan-300",
  strength: "bg-emerald-400",
  hyrox: "bg-fuchsia-400",
  mobility: "bg-zinc-400",
  other: "bg-zinc-500",
};
export const SPORT_NAME: Record<string, string> = {
  run: "Run",
  bike: "Bike",
  swim: "Swim",
  strength: "Strength",
  hyrox: "Hyrox",
  mobility: "Mobility",
  other: "Other",
};

const SPORT_OF: Record<string, Sport> = {
  running: "run", trail_running: "run", treadmill_running: "run", track_running: "run",
  cycling: "bike", road_biking: "bike", indoor_cycling: "bike", mountain_biking: "bike", virtual_ride: "bike", gravel_cycling: "bike",
  lap_swimming: "swim", open_water_swimming: "swim", swimming: "swim",
  strength_training: "strength", hiit: "hyrox", cardio: "other", yoga: "mobility", pilates: "mobility",
};
/** Maps a Garmin activity type key to a Body IQ sport. */
export const garminSport = (typeKey: string | null): Sport => SPORT_OF[(typeKey ?? "").toLowerCase()] ?? "other";


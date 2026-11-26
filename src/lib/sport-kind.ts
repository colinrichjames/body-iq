/** Sports described by duration and distance, not by an exercise list. */
export const ENDURANCE_SPORTS = ["run", "bike", "swim", "row"] as const;
export const isEndurance = (sport: string) => (ENDURANCE_SPORTS as readonly string[]).includes(sport);

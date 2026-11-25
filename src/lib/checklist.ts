export type ChecklistState = {
  races: number;
  hasTargets: boolean;
  scans: number;
  workouts: number;
  foodEntries: number;
  garminConnected: boolean;
};

export type ChecklistItem = { key: string; title: string; hint: string; href: string; done: boolean; optional?: boolean };

/** The first-run steps, in the order that gets someone to a useful dashboard fastest. */
export function buildChecklist(s: ChecklistState): ChecklistItem[] {
  return [
    { key: "race", title: "Add a race", hint: "Body IQ builds your training plan backwards from race day.", href: "/races", done: s.races > 0 },
    { key: "targets", title: "Set calorie and protein targets", hint: "Needed for the nutrition part of your Body IQ score.", href: "/nutrition", done: s.hasTargets },
    { key: "scan", title: "Log a body scan", hint: "Weight, body fat and muscle. A second scan unlocks body composition.", href: "/scans", done: s.scans > 0 },
    { key: "workout", title: "Add or finish a workout", hint: "Generate a plan from a race, or add a session by hand.", href: "/workouts/new", done: s.workouts > 0 },
    { key: "food", title: "Log your first meal", hint: "Scan a barcode, search, or type it in.", href: "/nutrition/log", done: s.foodEntries > 0 },
    { key: "garmin", title: "Connect Garmin", hint: "Optional. Adds sleep, HRV and steps for recovery and activity.", href: "/connect", done: s.garminConnected, optional: true },
  ];
}

export const checklistProgress = (items: ChecklistItem[]) => {
  const required = items.filter((i) => !i.optional);
  return { done: required.filter((i) => i.done).length, total: required.length, complete: required.every((i) => i.done) };
};

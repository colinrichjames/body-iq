import { describe, expect, it } from "vitest";
import { buildChecklist, checklistProgress } from "./checklist";

const empty = { races: 0, hasTargets: false, scans: 0, workouts: 0, foodEntries: 0, garminConnected: false };

describe("first-run checklist", () => {
  it("starts with nothing done", () => {
    const p = checklistProgress(buildChecklist(empty));
    expect(p).toEqual({ done: 0, total: 5, complete: false });
  });
  it("marks steps from real data and ignores the optional one for completion", () => {
    const items = buildChecklist({ races: 1, hasTargets: true, scans: 1, workouts: 2, foodEntries: 3, garminConnected: false });
    expect(items.find((i) => i.key === "garmin")?.done).toBe(false);
    expect(checklistProgress(items)).toEqual({ done: 5, total: 5, complete: true });
  });
  it("tracks partial progress", () => {
    expect(checklistProgress(buildChecklist({ ...empty, races: 1, scans: 1 })).done).toBe(2);
  });
});

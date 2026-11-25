import { describe, expect, it } from "vitest";
import { phaseInfo, planStartFrom, planStarts } from "./race-phase";
import { planWeeks } from "./plan";

describe("phaseInfo", () => {
  const start = "2026-09-07";
  const race = "2026-12-06";
  const weeks = planWeeks("half_marathon", start, race);

  it("moves through the phases as the plan progresses, unlike counting from today", () => {
    const seen = new Set<string>();
    for (const w of weeks) seen.add(phaseInfo("half_marathon", race, w.weekStart, start)!.phase);
    expect([...seen]).toEqual(expect.arrayContaining(["base", "build", "peak", "taper"]));
  });
  it("labels the week and calls the last week race week", () => {
    const first = phaseInfo("half_marathon", race, start, start)!;
    expect(first.text).toBe(`Base phase, week 1 of ${weeks.length}`);
    expect(phaseInfo("half_marathon", race, "2026-12-02", start)!.text).toBe("Race week");
  });
  it("is null with no plan or after the race", () => {
    expect(phaseInfo("half_marathon", race, "2026-11-01", null)).toBeNull();
    expect(phaseInfo("half_marathon", race, "2026-12-07", start)).toBeNull();
  });
});

describe("plan start", () => {
  it("uses the newest generated batch, so a rebuild re-bases the phase", () => {
    const rows = [
      { workout_date: "2026-09-07", created_at: "2026-09-06T10:00:00Z" },
      { workout_date: "2026-11-02", created_at: "2026-11-01T09:00:00Z" },
      { workout_date: "2026-11-03", created_at: "2026-11-01T09:00:01Z" },
    ];
    expect(planStartFrom(rows)).toBe("2026-11-02");
    expect(planStartFrom([])).toBeNull();
    expect(planStarts(rows.map((r) => ({ ...r, race_id: "r1" }))).get("r1")).toBe("2026-11-02");
  });
});

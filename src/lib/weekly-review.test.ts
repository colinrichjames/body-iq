import { describe, expect, it } from "vitest";
import { isMonday, reviewWeek, weeklyReview, type ReviewInput } from "./weekly-review";
import { downgradeProposal, type CtxWorkout } from "./coach-actions";

const today = "2026-11-30"; // Monday
const base: ReviewInput = { today, workouts: [], nutrition: [], checkins: [], weights: [], targets: { calories: null, protein: null } };

describe("weekly review", () => {
  it("reviews the Monday to Sunday week before", () => {
    expect(isMonday(today)).toBe(true);
    expect(reviewWeek(today)).toEqual({ start: "2026-11-23", end: "2026-11-29" });
  });
  it("says nothing when nothing was logged", () => {
    expect(weeklyReview(base)).toBeNull();
  });
  it("computes every line from the logs", () => {
    const r = weeklyReview({
      ...base,
      workouts: [
        { workout_date: "2026-11-24", status: "completed", title: "Easy run", planned_duration_min: 40 },
        { workout_date: "2026-11-26", status: "completed", title: "Legs", planned_duration_min: 50, actual_duration_min: 55 },
        { workout_date: "2026-11-27", status: "skipped", title: "Tempo run", planned_duration_min: 45 },
        { workout_date: "2026-11-28", status: "planned", title: "Long ride", planned_duration_min: 90 },
        { workout_date: "2026-11-20", status: "completed", title: "Outside the week", planned_duration_min: 30 },
      ],
      nutrition: [
        { day: "2026-11-23", calories: 2000, protein_g: 150 },
        { day: "2026-11-24", calories: 2200, protein_g: 120 },
        { day: "2026-11-25", calories: 0, protein_g: 0 },
      ],
      checkins: [{ day: "2026-11-24", sleep_hours: 6, soreness: 4, energy: 2 }, { day: "2026-11-26", sleep_hours: 8, soreness: 2, energy: 4 }],
      weights: [{ day: "2026-11-23", weight: 181.2 }, { day: "2026-11-29", weight: 180.0 }],
      targets: { calories: 2300, protein: 150 },
    });
    const t = r!.lines!.join("\n");
    expect(t).toContain("2 of 4 planned sessions done, 1 skipped, 1 not done, about 95 min logged");
    expect(t).toContain("Not done: Tempo run, Long ride");
    expect(t).toContain("logged 2 of 7 days, averaging 2100 cal against a 2300 target; protein target hit on 1 of 2 days");
    expect(t).toContain("too few logged days");
    expect(t).toContain("sleep averaged 7 h (2 check-ins), soreness averaged 3 of 5");
    expect(t).toContain("down 1.2 lb");
  });
  it("admits when there is no food data", () => {
    const r = weeklyReview({ ...base, workouts: [{ workout_date: "2026-11-24", status: "completed", title: "Run", planned_duration_min: 30 }] });
    expect(r!.lines!.join(" ")).toContain("no food logged");
  });
});

const w = (o: Partial<CtxWorkout> = {}): CtxWorkout => ({ id: "w1", title: "Tempo run", sport: "run", status: "planned", workout_date: today, structure: null, planned_duration_min: 50, planned_distance_km: 10, race_id: null, generated: false, ...o }) as CtxWorkout;

describe("downgradeProposal", () => {
  it("scales time and distance together so pace is unchanged, and renames", () => {
    const p = downgradeProposal(w())!;
    expect(p.params).toMatchObject({ title: "Easy: Tempo run", minutes: 30, km: 6 });
  });
  it("drops a set on each lift", () => {
    const p = downgradeProposal(w({ sport: "strength", title: "Heavy legs", planned_duration_min: null, planned_distance_km: null, structure: { exercises: [{ name: "Squat", sets: 4, reps: 5 }, { name: "Plank", sets: 1 }] } }))!;
    expect((p.params.structure as { exercises: { sets: number }[] }).exercises.map((e) => e.sets)).toEqual([3, 1]);
  });
  it("only offers for a planned session", () => {
    expect(downgradeProposal(w({ status: "completed" }))).toBeNull();
  });
});

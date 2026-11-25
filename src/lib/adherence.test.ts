import { describe, expect, it } from "vitest";
import { adherence, planMissed, streaks } from "./adherence";
import type { Sport, WorkoutStatus } from "./types";

let n = 0;
const w = (workout_date: string, status: WorkoutStatus, title = "Easy run", sport: Sport = "run", race_id: string | null = null) => ({ id: `w${n++}`, workout_date, status, title, sport, race_id, planned_duration_min: 45 });
const TODAY = "2026-11-25"; // Wednesday

describe("adherence", () => {
  it("counts only sessions that are due", () => {
    const a = adherence([w("2026-11-24", "completed"), w("2026-11-23", "planned"), w("2026-11-22", "skipped"), w("2026-11-25", "planned"), w("2026-11-27", "planned")], TODAY, 7);
    expect(a).toEqual({ done: 1, due: 3, pct: 33 });
  });
  it("is null with nothing due", () => {
    expect(adherence([w("2026-11-27", "planned")], TODAY, 7).pct).toBeNull();
  });
});

describe("streaks", () => {
  it("counts consecutive completed sessions, newest first", () => {
    const s = streaks([w("2026-11-24", "completed"), w("2026-11-23", "completed"), w("2026-11-22", "skipped"), w("2026-11-21", "completed")], TODAY);
    expect(s.sessions).toBe(2);
  });
  it("counts weeks at 80% or better and ignores empty weeks", () => {
    const wk = (d: string, done: number, of: number) => Array.from({ length: of }, (_, i) => w(d, i < done ? "completed" : "planned"));
    const list = [...wk("2026-11-24", 4, 5), ...wk("2026-11-17", 5, 5), ...wk("2026-11-03", 1, 5)];
    const s = streaks(list, TODAY);
    expect(s.weeks).toBe(2); // this week 80%, last week 100%, an empty week, then a bad week
    expect(s.bestWeeks).toBe(2);
  });
  it("keeps last week's streak while this week is still early", () => {
    const list = [...Array.from({ length: 4 }, () => w("2026-11-18", "completed")), w("2026-11-24", "planned")];
    expect(streaks(list, TODAY).weeks).toBe(1);
  });
});

describe("planMissed", () => {
  it("moves a recent hard session to the next free day and skips the rest", () => {
    const long = w("2026-11-23", "planned", "Long run", "run");
    const old = w("2026-11-14", "planned", "Easy run");
    const plan = planMissed([long, old, w("2026-11-25", "planned", "Strength"), w("2026-11-26", "planned", "Intervals")], TODAY);
    expect(plan.moves).toEqual([{ id: long.id, title: "Long run", from: "2026-11-23", to: "2026-11-28" }]);
    expect(plan.skips.map((s) => s.id)).toEqual([old.id]);
  });
  it("never makes up more than two make-ups", () => {
    const list = [w("2026-11-21", "planned", "Long run"), w("2026-11-22", "planned", "Tempo run"), w("2026-11-23", "planned", "Intervals")];
    expect(planMissed(list, TODAY).moves).toHaveLength(2);
  });
  it("doesn't put a make-up after race day", () => {
    const plan = planMissed([w("2026-11-23", "planned", "Long run", "run", "r1")], TODAY, { r1: "2026-11-26" });
    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0].to).toBe("2026-11-25");
    expect(planMissed([w("2026-11-23", "planned", "Long run", "run", "r1")], TODAY, { r1: "2026-11-25" }).moves).toHaveLength(0);
  });
});

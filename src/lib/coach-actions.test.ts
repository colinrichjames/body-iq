import { describe, expect, it } from "vitest";
import { mapCheckin, parseAction, parseDay, type CtxWorkout, type ParseCtx } from "./coach-actions";

const today = "2026-11-26"; // Thursday
const w = (o: Partial<CtxWorkout>): CtxWorkout => ({ id: "w1", title: "Easy run", sport: "run", status: "planned", workout_date: today, structure: null, planned_duration_min: 40, planned_distance_km: 6, race_id: null, generated: false, ...o }) as CtxWorkout;
const ctx = (workouts: CtxWorkout[] = [w({})], races: ParseCtx["races"] = []): ParseCtx => ({ today, workouts, races });
const first = (r: ReturnType<typeof parseAction>) => (r && "proposals" in r ? r.proposals[0] : null);

describe("parseDay", () => {
  it("reads common day words", () => {
    expect(parseDay("tomorrow", today)).toBe("2026-11-27");
    expect(parseDay("on friday", today)).toBe("2026-11-27");
    expect(parseDay("thursday", today)).toBe("2026-12-03");
    expect(parseDay("in 3 days", today)).toBe("2026-11-29");
    expect(parseDay("Dec 2", today)).toBe("2026-12-02");
    expect(parseDay("2026-12-05", today)).toBe("2026-12-05");
    expect(parseDay("whenever", today)).toBeNull();
  });
});

describe("parseAction", () => {
  it("ignores questions", () => {
    expect(parseAction("what is my workout today?", ctx())).toBeNull();
  });
  it("proposes a reschedule with exact dates", () => {
    const p = first(parseAction("move today's run to friday", ctx()));
    expect(p?.kind).toBe("reschedule");
    expect(p?.params).toMatchObject({ id: "w1", from: today, to: "2026-11-27" });
  });
  it("refuses to move into the past", () => {
    const r = parseAction("move today's run to yesterday", ctx());
    expect(r && "ask" in r).toBe(true);
  });
  it("asks which when two sessions match", () => {
    const r = parseAction("skip today's workout", ctx([w({}), w({ id: "w2", title: "Leg day", sport: "strength" })]));
    expect(r && "ask" in r && r.ask).toMatch(/Which one/);
  });
  it("won't mark done a session with an impossible pace", () => {
    const r = parseAction("mark today's run done", ctx([w({ planned_duration_min: 10, planned_distance_km: 10 })]));
    expect(r && "ask" in r).toBe(true);
  });
  it("proposes skip and complete", () => {
    expect(first(parseAction("skip today's run", ctx()))?.kind).toBe("skip");
    expect(first(parseAction("mark today's run done", ctx()))?.kind).toBe("complete");
  });
  it("logs water with units converted", () => {
    expect(first(parseAction("log 2 glasses of water", ctx()))?.params).toMatchObject({ ml: 500 });
    expect(parseAction("drank 9000 ml water", ctx())).toMatchObject({ ask: expect.any(String) });
  });
  it("logs custom calories with a meal", () => {
    const p = first(parseAction("log 500 calories 40g protein for lunch", ctx()));
    expect(p?.kind).toBe("log_food");
    expect(p?.params).toMatchObject({ meal: "lunch" });
  });
  it("rejects absurd calories", () => {
    expect(parseAction("log 9000 calories", ctx())).toMatchObject({ ask: expect.any(String) });
  });
  it("sets targets within the same bounds as the screen", () => {
    expect(first(parseAction("set protein target to 180", ctx()))?.params).toMatchObject({ column: "protein_target_g", value: 180 });
    expect(first(parseAction("set rest day calorie target to 2400", ctx()))?.params).toMatchObject({ column: "rest_calorie_target", value: 2400 });
    expect(parseAction("set calorie target to 99999", ctx())).toMatchObject({ ask: expect.any(String) });
  });
  it("copies yesterday", () => {
    expect(first(parseAction("copy yesterday's lunch", ctx()))?.params).toMatchObject({ from: "2026-11-25", meal: "lunch" });
  });
  it("maps a check-in and shows the estimate", () => {
    const p = first(parseAction("slept badly, pretty sore", ctx()));
    expect(p?.kind).toBe("checkin");
    expect(p?.params).toMatchObject({ sleep_hours: 5, soreness: 3 });
    expect(p?.lines.join(" ")).toMatch(/counted as about 5 h/);
  });
  it("validates scans", () => {
    expect(first(parseAction("log scan 182 lb 17% body fat", ctx()))?.params).toMatchObject({ weight_lb: 182, body_fat_pct: 17 });
    expect(parseAction("log scan 5 lb", ctx())).toMatchObject({ ask: expect.any(String) });
  });
  it("shifts a race plan but not onto race day", () => {
    const races = [{ id: "r1", name: "HYROX", race_date: "2026-12-20" }];
    const ws = [w({ id: "a", race_id: "r1", generated: true, workout_date: "2026-11-30" }), w({ id: "b", race_id: "r1", generated: true, workout_date: "2026-12-18" })];
    expect(first(parseAction("shift my plan back 1 day", ctx(ws, races)))?.kind).toBe("shift_plan");
    expect(parseAction("shift my plan back 5 days", ctx(ws, races))).toMatchObject({ ask: expect.any(String) });
  });
});

describe("mapCheckin", () => {
  it("maps words to scales", () => {
    expect(mapCheckin("I feel wrecked and exhausted")).toMatchObject({ soreness: 4, energy: 1 });
    expect(mapCheckin("slept 7.5 hours")).toMatchObject({ sleep_hours: 7.5 });
  });
});

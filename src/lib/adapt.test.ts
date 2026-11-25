import { describe, expect, it } from "vitest";
import { adaptSession, adaptWeight, adaptedTotals } from "./adapt";
import type { Readiness } from "./readiness";

const lift = { sport: "strength" as const, title: "Upper body" };
const r = (status: Readiness["status"]): Readiness => ({ status, headline: "", reasons: [], day: "2026-11-25", metrics: { sleepH: null, hrv: null, hrvBaseline: null, rhr: null, battery: null, stress: null } });
const load = (status: "steady" | "fatigued" | "building" | "fresh", tsb = 0) => ({ status, tsb });

describe("adaptSession", () => {
  it("leaves a good day alone", () => {
    const a = adaptSession(lift, { readiness: r("green"), load: load("steady"), deload: "none" });
    expect(a).toMatchObject({ mode: "as_planned", factor: 1, setsDelta: 0 });
  });
  it("one amber flag is only noted, not acted on", () => {
    expect(adaptSession(lift, { readiness: r("amber"), load: null, deload: "none" }).mode).toBe("as_planned");
  });
  it("red recovery trims 5%", () => {
    expect(adaptSession(lift, { readiness: r("red"), load: null, deload: "none" })).toMatchObject({ mode: "trim", factor: 0.95, setsDelta: 0 });
  });
  it("amber plus fatigued goes lighter", () => {
    expect(adaptSession(lift, { readiness: r("amber"), load: load("fatigued", -20), deload: "none" })).toMatchObject({ mode: "lighter", factor: 0.9, setsDelta: 1 });
  });
  it("everything bad means easy", () => {
    expect(adaptSession(lift, { readiness: r("red"), load: load("fatigued", -20), deload: "watch" })).toMatchObject({ mode: "easy", factor: 0.85, setsDelta: 1 });
  });
  it("building load only counts when form is under -8", () => {
    expect(adaptSession(lift, { readiness: r("amber"), load: load("building", -3), deload: "none" }).points).toBe(1);
    expect(adaptSession(lift, { readiness: r("amber"), load: load("building", -9), deload: "none" }).points).toBe(2);
  });
  it("does not scale weights twice during a deload", () => {
    const a = adaptSession(lift, { readiness: r("red"), load: null, deload: "deload" });
    expect(a.factor).toBe(1);
    expect(a.setsDelta).toBe(1);
  });
  it("never adapts easy sessions", () => {
    expect(adaptSession({ sport: "mobility", title: "Mobility" }, { readiness: r("red"), load: load("fatigued"), deload: "deload" }).mode).toBe("as_planned");
  });
});

describe("adaptWeight and adaptedTotals", () => {
  it("rounds to the step and never goes below one step", () => {
    expect(adaptWeight(135, 0.9, 10)).toBe(120);
    expect(adaptWeight(100, 1, 5)).toBe(100);
    expect(adaptWeight(5, 0.85, 5)).toBe(5);
  });
  it("drops one set but keeps at least two", () => {
    const w = { structure: { exercises: [{ name: "Squat", sets: 4, reps: 5 }, { name: "Curl", sets: 2, reps: 10 }] } };
    expect(adaptedTotals(w, 1)).toEqual({ Squat: 3 });
    expect(adaptedTotals(w, 0)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { computeReadiness, mergeCheckins } from "./readiness";
import type { DailyHealth, RecoveryCheckin } from "./types";

const garmin = (day: string, o: Partial<DailyHealth> = {}): DailyHealth => ({ user_id: "u", day, sleep_seconds: null, sleep_score: null, hrv_ms: null, resting_hr: null, body_battery_max: null, body_battery_min: null, stress_avg: null, steps: null, ...o });
const checkin = (day: string, o: Partial<RecoveryCheckin> = {}): RecoveryCheckin => ({ day, sleep_hours: null, soreness: null, energy: null, ...o });

describe("mergeCheckins", () => {
  it("makes a row from a check-in alone, newest first", () => {
    const rows = mergeCheckins([], [checkin("2026-11-24", { sleep_hours: 7 }), checkin("2026-11-25", { sleep_hours: 5 })]);
    expect(rows.map((r) => r.day)).toEqual(["2026-11-25", "2026-11-24"]);
    expect(rows[0]).toMatchObject({ sleep_seconds: 18000, manual: true });
  });
  it("fills sleep only when the watch has none, and always adds soreness and energy", () => {
    const rows = mergeCheckins([garmin("2026-11-25", { sleep_seconds: 28800 }), garmin("2026-11-24")], [checkin("2026-11-25", { sleep_hours: 4, soreness: 3 }), checkin("2026-11-24", { sleep_hours: 6.5, energy: 4 })]);
    expect(rows[0]).toMatchObject({ sleep_seconds: 28800, soreness: 3 });
    expect(rows[0].manual).toBeUndefined();
    expect(rows[1]).toMatchObject({ sleep_seconds: 23400, energy: 4 });
  });
});

describe("readiness from a check-in", () => {
  it("is green after a good night with low soreness and decent energy", () => {
    const r = computeReadiness(mergeCheckins([], [checkin("2026-11-25", { sleep_hours: 8, soreness: 1, energy: 4 })]))!;
    expect(r.status).toBe("green");
    expect(r.reasons).toEqual(["No recovery flags."]);
  });
  it("adds up short sleep, high soreness and low energy to red", () => {
    const r = computeReadiness(mergeCheckins([], [checkin("2026-11-25", { sleep_hours: 5, soreness: 5, energy: 1 })]))!;
    expect(r.status).toBe("red");
    expect(r.reasons).toEqual(expect.arrayContaining(["Slept 5.0 h.", "Soreness 5 out of 5.", "Energy 1 out of 5."]));
  });
  it("calls amber for one moderate flag pair", () => {
    const r = computeReadiness(mergeCheckins([], [checkin("2026-11-25", { sleep_hours: 6, soreness: 4, energy: 3 })]))!;
    expect(r.status).toBe("amber");
  });
  it("does nothing for the old callers with plain Garmin rows", () => {
    expect(computeReadiness([garmin("2026-11-25", { sleep_seconds: 30000 })])!.status).toBe("green");
  });
});

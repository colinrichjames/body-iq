import { describe, expect, it } from "vitest";
import { elapsedMs, hasProgress, pickResume, progressLabel } from "./progress";
import { buildSteps, sessionUnits } from "./steps";
import type { Workout } from "./types";

const workout = (structure: Workout["structure"]) => ({ structure }) as unknown as Workout;

describe("elapsed time", () => {
  it("counts saved time plus the current visit only", () => {
    expect(elapsedMs(120_000, 1_000, 31_000)).toBe(150_000);
  });
  it("does not advance while the player is closed (no open segment)", () => {
    expect(elapsedMs(120_000, null, 9_999_999)).toBe(120_000);
  });
  it("never goes negative on clock skew", () => {
    expect(elapsedMs(0, 5_000, 1_000)).toBe(0);
  });
});

describe("resume choice", () => {
  const d = (logs: number, blockIndex = 0, elapsed = 0) => ({ logs: Array(logs).fill({}), stepIndex: logs, blockIndex, elapsedMs: elapsed });
  it("uses the copy with more logged sets", () => {
    expect(pickResume(d(4), d(2))?.logs.length).toBe(4);
    expect(pickResume(d(2), d(5))?.logs.length).toBe(5);
  });
  it("uses whichever exists", () => {
    expect(pickResume(null, d(1))?.logs.length).toBe(1);
    expect(pickResume(d(1), null)?.logs.length).toBe(1);
    expect(pickResume(null, null)).toBeNull();
  });
});

describe("progress rules", () => {
  it("counts logged sets, advanced blocks, or a minute of timer as progress", () => {
    expect(hasProgress({ sets: 1, blockIndex: 0, elapsedMs: 0 })).toBe(true);
    expect(hasProgress({ sets: 0, blockIndex: 1, elapsedMs: 0 })).toBe(true);
    expect(hasProgress({ sets: 0, blockIndex: 0, elapsedMs: 60_000 })).toBe(true);
    expect(hasProgress({ sets: 0, blockIndex: 0, elapsedMs: 10_000 })).toBe(false);
  });
  it("labels sets progress as N of M", () => {
    expect(progressLabel("sets", null, 4, 16)).toBe("4 of 16 sets done");
  });
});

describe("session units", () => {
  it("counts every set of a straight-sets session", () => {
    const w = workout({ exercises: [{ name: "Bench", sets: 4, reps: 8 }, { name: "Fly", sets: 3, reps: 12 }] });
    expect(buildSteps(w)).toHaveLength(7);
    expect(sessionUnits(w)).toEqual({ kind: "sets", total: 7 });
  });
  it("counts blocks and timer-only sessions", () => {
    expect(sessionUnits(workout({ blocks: [{ name: "Run", detail: "x" }, { name: "Ski", detail: "y" }] }))).toEqual({ kind: "blocks", total: 2 });
    expect(sessionUnits(workout(null))).toEqual({ kind: "timer", total: 0 });
  });
});

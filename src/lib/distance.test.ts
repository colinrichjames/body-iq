import { describe, expect, it } from "vitest";
import { fmtDist, fmtPace, fromKm, paceProblem, sessionPaceProblem, toKm } from "./distance";

describe("distance", () => {
  it("3.1 mi round-trips exactly", () => {
    expect(fromKm(toKm(3.1, "mi"), "mi")).toBe(3.1);
    expect(fmtDist(toKm(3.1, "mi"), "mi")).toBe("3.1 mi");
    expect(fromKm(toKm(5, "km"), "km")).toBe(5);
  });
  it("flags 3.1 mi in 1 minute and a 25-minute mile", () => {
    expect(paceProblem(1, toKm(3.1, "mi"))).toMatch(/pace looks off/);
    expect(paceProblem(75, toKm(3, "mi"))).toMatch(/pace looks off/);
    expect(paceProblem(27, toKm(3.1, "mi"))).toBeNull();
    expect(paceProblem(30, null)).toBeNull();
  });
  it("formats pace", () => {
    expect(fmtPace(30, toKm(3, "mi"), "mi")).toBe("10:00 /mi");
  });
});

describe("sessionPaceProblem", () => {
  it("blocks an impossible run pace on every path", () => {
    expect(sessionPaceProblem("run", 1, toKm(3.1, "mi"))).toMatch(/pace looks off/);
    expect(sessionPaceProblem("run", 120, toKm(3.1, "mi"))).toMatch(/pace looks off/);
  });
  it("lets a sane run through, including the corrected 31 min / 3.1 mi", () => {
    expect(sessionPaceProblem("run", 31, toKm(3.1, "mi"))).toBeNull();
  });
  it("ignores missing values and non-run sports", () => {
    expect(sessionPaceProblem("run", null, toKm(3.1, "mi"))).toBeNull();
    expect(sessionPaceProblem("run", 30, null)).toBeNull();
    expect(sessionPaceProblem("strength", 1, 50)).toBeNull();
  });
});

describe("distance round trip", () => {
  it("reads back exactly what was typed, in mi and km, for every 0.01 up to 100", () => {
    for (let i = 1; i <= 10000; i++) {
      const typed = i / 100;
      for (const unit of ["mi", "km"] as const) {
        // Stored as numeric(9,4); a string like "4.9890" is what the API returns, so go through String() too.
        const stored = Number(String(toKm(typed, unit).toFixed(4)));
        expect(fromKm(stored, unit)).toBe(typed);
      }
    }
  });
  it("3.1 mi is exactly 3.1 and never a float32 artifact", () => {
    const back = fromKm(Number("4.9890"), "mi");
    expect(back).toBe(3.1);
    expect(String(back)).toBe("3.1");
  });
});

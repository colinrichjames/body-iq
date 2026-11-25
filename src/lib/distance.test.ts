import { describe, expect, it } from "vitest";
import { fmtDist, fmtPace, fromKm, paceProblem, toKm } from "./distance";

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

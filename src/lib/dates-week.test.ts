import { describe, expect, it } from "vitest";
import { startOfSundayWeek, startOfWeek } from "./dates";

describe("startOfSundayWeek", () => {
  it("maps every day of a week to its Sunday", () => {
    // 2026-11-22 is a Sunday
    for (const d of ["2026-11-22", "2026-11-23", "2026-11-26", "2026-11-28"]) expect(startOfSundayWeek(d)).toBe("2026-11-22");
    expect(startOfSundayWeek("2026-11-29")).toBe("2026-11-29");
  });
  it("leaves the Monday-based plan week alone", () => {
    expect(startOfWeek("2026-11-26")).toBe("2026-11-23");
  });
});

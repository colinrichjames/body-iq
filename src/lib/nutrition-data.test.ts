import { describe, expect, it } from "vitest";
import { totalsByDay } from "./nutrition-data";
import { sortScansNewestFirst } from "./scan-order";
import { displayMinutes } from "./week";

const r = (day: string, calories: number | string, protein_g = 0) => ({ day, calories, protein_g, carbs_g: 0, fat_g: 0, sodium_mg: null, sugar_g: null, fiber_g: null });

describe("totalsByDay", () => {
  it("adds a day's entries (numbers may arrive as strings) and puts the newest day first", () => {
    const days = totalsByDay([r("2026-11-25", "500"), r("2026-11-26", 1000, 40), r("2026-11-26", "550.5", 10), r("2026-11-25", 105)]);
    expect(days.map((d) => d.day)).toEqual(["2026-11-26", "2026-11-25"]);
    expect(days[0]).toMatchObject({ calories: 1550.5, protein_g: 50 });
    expect(days[1].calories).toBe(605);
  });
  it("is empty when nothing is logged", () => {
    expect(totalsByDay([])).toEqual([]);
  });
});

describe("latest scan", () => {
  const a = { id: "a", scanned_at: "2026-11-25", created_at: "2026-11-25T10:00:00Z", weight_lb: 182 };
  const b = { id: "b", scanned_at: "2026-11-25", created_at: "2026-11-25T18:00:00Z", weight_lb: 180 };
  it("two scans on one day: the one saved last is latest, in any input order", () => {
    expect(sortScansNewestFirst([a, b])[0].weight_lb).toBe(180);
    expect(sortScansNewestFirst([b, a])[0].weight_lb).toBe(180);
  });
  it("a newer date beats a later save", () => {
    const older = { ...b, id: "c", scanned_at: "2026-11-24", created_at: "2026-11-26T00:00:00Z" };
    expect(sortScansNewestFirst([older, a])[0].id).toBe("a");
  });
});

describe("displayMinutes", () => {
  it("shows what was done for a finished session and the plan otherwise", () => {
    expect(displayMinutes({ status: "completed", planned_duration_min: 30, actual_duration_min: 31 })).toBe(31);
    expect(displayMinutes({ status: "completed", planned_duration_min: 30, actual_duration_min: null })).toBe(30);
    expect(displayMinutes({ status: "planned", planned_duration_min: 45, actual_duration_min: null })).toBe(45);
    expect(displayMinutes({ status: "skipped", planned_duration_min: null, actual_duration_min: null })).toBeNull();
  });
});

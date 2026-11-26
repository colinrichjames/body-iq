import { describe, expect, it } from "vitest";
import { cleanItems, entriesFor, frequentFoods, perPortion, recentFoods, sumItems, type MealItem } from "./meals";
import { loggingStreak, macroSplit, micronutrients } from "./food-stats";

const item = (name: string, cal: number, extra: Partial<MealItem> = {}): MealItem => ({ name, brand: null, amount_label: null, calories: cal, protein_g: 10, carbs_g: 20, fat_g: 5, sodium_mg: null, sugar_g: null, fiber_g: null, ...extra });

describe("cleanItems", () => {
  it("accepts good items and trims", () => {
    expect(cleanItems([{ name: " Oats ", calories: "150", protein_g: 5 }])).toEqual([{ name: "Oats", brand: null, amount_label: null, calories: 150, protein_g: 5, carbs_g: 0, fat_g: 0, sodium_mg: null, sugar_g: null, fiber_g: null }]);
  });
  it("rejects bad input", () => {
    expect(cleanItems([])).toBeNull();
    expect(cleanItems("x")).toBeNull();
    expect(cleanItems([{ name: "", calories: 1 }])).toBeNull();
    expect(cleanItems([{ name: "a", calories: -5 }])).toBeNull();
    expect(cleanItems([{ name: "a", calories: 1e9 }])).toBeNull();
    expect(cleanItems(Array.from({ length: 61 }, () => ({ name: "a", calories: 1 })))).toBeNull();
  });
});

describe("recipes", () => {
  const rec = { kind: "recipe" as const, name: "Chili", portions: 4, items: [item("Beans", 400, { sodium_mg: 800 }), item("Beef", 800), item("Tomato", 200)] };
  it("sums and splits into portions", () => {
    expect(sumItems(rec.items).calories).toBe(1400);
    const p = perPortion(rec.items, 4);
    expect(p.calories).toBe(350);
    expect(p.protein_g).toBe(7.5);
    expect(p.sodium_mg).toBe(200);
    expect(p.sugar_g).toBeNull();
  });
  it("logs one entry scaled by the portions eaten", () => {
    const [e] = entriesFor(rec, 1.5);
    expect(entriesFor(rec, 1.5)).toHaveLength(1);
    expect(e).toMatchObject({ name: "Chili", calories: 525, amount_label: "1.5 × portion" });
  });
  it("logs a saved meal as separate items", () => {
    expect(entriesFor({ kind: "meal", name: "Breakfast", portions: 1, items: [item("Eggs", 150), item("Toast", 100)] })).toHaveLength(2);
  });
});

describe("recent and frequent", () => {
  const rows = [
    { name: "Eggs", brand: null, calories: 150, protein_g: 12, carbs_g: 1, fat_g: 10 },
    { name: "Oats", brand: "Quaker", calories: 150, protein_g: 5, carbs_g: 27, fat_g: 3 },
    { name: "eggs", brand: null, calories: 150, protein_g: 12, carbs_g: 1, fat_g: 10 },
    { name: "Rice", brand: null, calories: 200, protein_g: 4, carbs_g: 44, fat_g: 0 },
    { name: "Oats", brand: "Quaker", calories: 150, protein_g: 5, carbs_g: 27, fat_g: 3 },
    { name: "Oats", brand: "Quaker", calories: 150, protein_g: 5, carbs_g: 27, fat_g: 3 },
  ];
  it("recent is distinct, newest first", () => {
    expect(recentFoods(rows).map((r) => r.name)).toEqual(["Eggs", "Oats", "Rice"]);
    expect(recentFoods(rows, 2)).toHaveLength(2);
  });
  it("frequent ranks by count", () => {
    const f = frequentFoods(rows);
    expect(f.map((x) => [x.item.name, x.count])).toEqual([["Oats", 3], ["Eggs", 2], ["Rice", 1]]);
  });
});

describe("macroSplit", () => {
  it("adds to 100", () => {
    expect(macroSplit(0, 0, 0)).toBeNull();
    const s = macroSplit(150, 250, 70)!;
    expect(s.p + s.c + s.f).toBe(100);
    expect(s).toEqual({ p: 27, c: 45, f: 28 });
    const t = macroSplit(1, 1, 1)!;
    expect(t.p + t.c + t.f).toBe(100);
  });
});

describe("micronutrients", () => {
  it("flags sodium over 2,300 and low fibre", () => {
    const m = micronutrients({ sodium_mg: 2600, fiber_g: 20, sugar_g: 60 }, 2500);
    expect(m.find((x) => x.key === "sodium")?.status).toBe("high");
    expect(m.find((x) => x.key === "fiber")).toMatchObject({ status: "low", goal: "about 35 g" });
    expect(m.find((x) => x.key === "sugar")?.status).toBe("info");
  });
  it("falls back to 25 g fibre without a target", () => {
    expect(micronutrients({ sodium_mg: 100, fiber_g: 30, sugar_g: 0 }, null)[1]).toMatchObject({ status: "ok", goal: "about 25 g" });
  });
});

describe("loggingStreak", () => {
  it("counts back from today when finished", () => {
    expect(loggingStreak(["2026-11-23", "2026-11-24", "2026-11-25"], "2026-11-25")).toEqual({ current: 3, longest: 3, todayDone: true });
  });
  it("stays alive through an unfinished today", () => {
    expect(loggingStreak(["2026-11-23", "2026-11-24"], "2026-11-25")).toEqual({ current: 2, longest: 2, todayDone: false });
  });
  it("breaks after a missed day and tracks the longest run", () => {
    expect(loggingStreak(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-24"], "2026-11-25")).toEqual({ current: 1, longest: 3, todayDone: false });
    expect(loggingStreak(["2026-11-20"], "2026-11-25").current).toBe(0);
    expect(loggingStreak([], "2026-11-25")).toEqual({ current: 0, longest: 0, todayDone: false });
  });
});

import { ringSegments } from "./food-stats";
describe("ringSegments", () => {
  it("is empty without macros", () => {
    expect(ringSegments(null, 100)).toEqual([]);
  });
  it("lays arcs end to end in carbs, fat, protein order", () => {
    const s = ringSegments({ p: 80, c: 5, f: 15 }, 200);
    expect(s.map((x) => x.key)).toEqual(["carbs", "fat", "protein"]);
    expect(s.map((x) => x.offset)).toEqual([-0, -10, -40]);
    expect(s[2].dash).toBe("160 40");
  });
  it("skips zero-percent macros", () => {
    expect(ringSegments({ p: 100, c: 0, f: 0 }, 100).map((x) => x.key)).toEqual(["protein"]);
  });
});

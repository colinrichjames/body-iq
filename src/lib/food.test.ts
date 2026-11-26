import { describe, expect, it } from "vitest";
import { foodFromOff, offName } from "./food";

describe("foodFromOff", () => {
  it("converts per-100g values to a serving", () => {
    const f = foodFromOff({ code: "1", product_name: "Bar", serving_quantity: 50, serving_size: "50 g", brands: "Acme, Other", nutriments: { "energy-kcal_100g": 400, proteins_100g: 20 } });
    expect(f).toMatchObject({ name: "Bar", brand: "Acme", servingLabel: "50 g", calories: 200, protein_g: 10 });
  });
  it("skips products with no name or no calories", () => {
    expect(foodFromOff({ nutriments: { "energy-kcal_100g": 10 } })).toBeNull();
    expect(foodFromOff({ product_name: "X", nutriments: {} })).toBeNull();
  });
  it("accepts list brands and per-language names from the newer search API", () => {
    const f = foodFromOff({ code: "2", product_name: { en: "Banana chips" }, brands: ["Acme", "Other"], nutriments: { "energy-kcal_100g": 500 } });
    expect(f?.name).toBe("Banana chips");
    expect(f?.brand).toBe("Acme");
    expect(f?.calories).toBe(500);
    expect(offName([{ main: "Pommes" }])).toBe("Pommes");
  });
});

import { cleanResults, foodProblem, type Food } from "./food";

const food = (o: Partial<Food>): Food => ({ source: "off", barcode: null, name: "Oats", brand: null, servingLabel: "100 g", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, sodium_mg: null, sugar_g: null, fiber_g: null, grams: 100, ...o });

describe("foodProblem", () => {
  it("rejects 100 g of oats at 48 cal", () => {
    expect(foodProblem(food({ name: "Oats premier-protein", calories: 48, protein_g: 20, carbs_g: 50, fat_g: 7 }))).toMatch(/match/);
  });
  it("rejects 20 g protein per 100 g of oats even when calories add up", () => {
    expect(foodProblem(food({ calories: 392, protein_g: 28, carbs_g: 45, fat_g: 11 }))).toMatch(/Protein is outside/);
  });
  it("accepts real rolled oats", () => {
    expect(foodProblem(food({ calories: 379, protein_g: 13.2, carbs_g: 67.7, fat_g: 6.5 }))).toBeNull();
  });
  it("rejects calories with no macros, impossible density and macros heavier than the serving", () => {
    expect(foodProblem(food({ name: "Mystery", calories: 300 }))).toMatch(/no macros/);
    expect(foodProblem(food({ name: "Fat", calories: 1000, protein_g: 0, carbs_g: 0, fat_g: 111 }))).toMatch(/900 kcal/);
    expect(foodProblem(food({ name: "Dust", calories: 140, protein_g: 20, carbs_g: 15, fat_g: 0, grams: 30 }))).toMatch(/weighs/);
  });
  it("allows zero-calorie foods and the user's own foods", () => {
    expect(foodProblem(food({ name: "Water", calories: 0 }))).toBeNull();
    const mine = food({ source: "custom", name: "My oats", calories: 48 });
    expect(cleanResults([mine, food({ name: "Oats premier-protein", calories: 48, protein_g: 20, carbs_g: 50, fat_g: 7 })])).toEqual([mine]);
  });
});

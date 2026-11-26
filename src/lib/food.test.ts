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

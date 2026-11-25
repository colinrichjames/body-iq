// Food lookup helpers. Open Food Facts reports nutrients per 100 g; we convert to per-serving here.

export type Food = {
  source: "off" | "custom";
  id?: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  /** Label for one serving, e.g. "30 g" or "1 bar". */
  servingLabel: string;
  /** Per one serving. */
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sodium_mg: number | null;
  sugar_g: number | null;
  fiber_g: number | null;
};

type Nutriments = Record<string, unknown>;
type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Nutriments;
};

const n = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;
};
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Converts an Open Food Facts product to per-serving values. Returns null if it has no calories to use. */
export function foodFromOff(p: OffProduct): Food | null {
  const nu = p.nutriments ?? {};
  const name = (p.product_name || p.product_name_en || "").trim();
  if (!name) return null;
  const servingG = n(p.serving_quantity);
  const grams = servingG && servingG > 0 && servingG <= 2000 ? servingG : 100;
  const label = servingG && p.serving_size ? p.serving_size.trim().slice(0, 60) : "100 g";
  const f = grams / 100;

  let kcal100 = n(nu["energy-kcal_100g"]);
  if (kcal100 === null) {
    const kj = n(nu["energy-kj_100g"]) ?? n(nu["energy_100g"]);
    kcal100 = kj !== null ? kj / 4.184 : null;
  }
  if (kcal100 === null) return null;

  const per = (key: string) => {
    const v = n(nu[`${key}_100g`]);
    return v === null ? null : v * f;
  };
  const sodiumG = per("sodium");
  return {
    source: "off",
    barcode: p.code ? String(p.code) : null,
    name: name.slice(0, 160),
    brand: p.brands ? p.brands.split(",")[0].trim().slice(0, 120) || null : null,
    servingLabel: label,
    calories: r1(kcal100 * f),
    protein_g: r1(per("proteins") ?? 0),
    carbs_g: r1(per("carbohydrates") ?? 0),
    fat_g: r1(per("fat") ?? 0),
    sodium_mg: sodiumG === null ? null : r1(sodiumG * 1000),
    sugar_g: per("sugars") === null ? null : r1(per("sugars") as number),
    fiber_g: per("fiber") === null ? null : r1(per("fiber") as number),
  };
}

export function scaleFood(food: Food, servings: number) {
  const s = (v: number | null) => (v === null ? null : r1(v * servings));
  return {
    calories: r1(food.calories * servings),
    protein_g: r1(food.protein_g * servings),
    carbs_g: r1(food.carbs_g * servings),
    fat_g: r1(food.fat_g * servings),
    sodium_mg: s(food.sodium_mg),
    sugar_g: s(food.sugar_g),
    fiber_g: s(food.fiber_g),
  };
}

export const isBarcode = (s: string) => /^\d{6,14}$/.test(s);

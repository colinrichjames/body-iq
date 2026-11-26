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
  /** Grams in one serving, when known (Open Food Facts items). Lets the macro checks work per 100 g. */
  grams?: number;
};

type Nutriments = Record<string, unknown>;
type OffProduct = {
  code?: string;
  product_name?: unknown;
  product_name_en?: unknown;
  brands?: string | string[];
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Nutriments;
};

const n = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;
};
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Brands arrive as "A, B" from the classic API and as a list from the newer search API. */
function firstBrand(b: string | string[] | undefined): string | null {
  const first = Array.isArray(b) ? b[0] : typeof b === "string" ? b.split(",")[0] : "";
  return typeof first === "string" ? first.trim().slice(0, 120) || null : null;
}

/** The newer search API can return names as a plain string or as a per-language object/list. Reduce to a string. */
export function offName(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return offName(v[0]);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return offName(o.en ?? o.main ?? Object.values(o)[0]);
  }
  return undefined;
}

/** Converts an Open Food Facts product to per-serving values. Returns null if it has no calories to use. */
export function foodFromOff(p: OffProduct): Food | null {
  const nu = p.nutriments ?? {};
  const name = (offName(p.product_name) || offName(p.product_name_en) || "").trim();
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
    brand: firstBrand(p.brands),
    servingLabel: label,
    grams,
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

/** Plausible protein per 100 g for common foods, as dry/raw/as sold. A listing far outside is almost certainly a data error. */
const PROTEIN_PER_100G: { match: RegExp; min: number; max: number }[] = [
  { match: /\boat(s|meal)?\b/i, min: 8, max: 18 },
  { match: /\b(white|brown|basmati|jasmine) rice\b|\brice\b/i, min: 5, max: 9 },
  { match: /\bpasta|spaghetti|macaroni\b/i, min: 8, max: 15 },
  { match: /\bchicken breast\b/i, min: 18, max: 34 },
  { match: /\begg(s)?\b/i, min: 10, max: 14 },
  { match: /\bbanana(s)?\b/i, min: 0, max: 2.5 },
  { match: /\bapple(s)?\b/i, min: 0, max: 1.5 },
];

/**
 * Checks a food's numbers against each other. Calories should roughly equal 4 x protein + 4 x carbs + 9 x fat, a serving
 * can't hold more than its own weight in macros or 900 kcal per 100 g, and protein per 100 g should fit the food.
 * Returns the problem, or null when the entry looks fine. Missing macros with calories listed count as a problem.
 */
export function foodProblem(f: Pick<Food, "name" | "calories" | "protein_g" | "carbs_g" | "fat_g" | "grams">): string | null {
  const expected = 4 * f.protein_g + 4 * f.carbs_g + 9 * f.fat_g;
  if (f.calories > 30 && expected === 0) return "Calories listed but no macros.";
  if (expected > 0 || f.calories > 0) {
    const tolerance = Math.max(40, 0.35 * Math.max(f.calories, expected));
    if (Math.abs(f.calories - expected) > tolerance) return "Calories don't match the macros.";
  }
  if (f.grams && f.grams > 0) {
    if (f.calories / f.grams > 9.2) return "More than 900 kcal per 100 g.";
    if (f.protein_g + f.carbs_g + f.fat_g > f.grams * 1.05) return "More macros than the serving weighs.";
    const group = PROTEIN_PER_100G.find((g) => g.match.test(f.name));
    if (group) {
      const p100 = (f.protein_g / f.grams) * 100;
      if (p100 < group.min * 0.7 || p100 > group.max * 1.15) return "Protein is outside the normal range for this food.";
    }
  }
  return null;
}

/** Drops Open Food Facts entries that fail the checks. Entries the user saved themselves are never removed. */
export function cleanResults(foods: Food[]): Food[] {
  return foods.filter((f) => f.source === "custom" || foodProblem(f) === null);
}

/** Saved foods, copied meals and recipes. Pure helpers shared by the food log screens and its server actions. */

export type MealItem = {
  name: string;
  brand: string | null;
  amount_label: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sodium_mg: number | null;
  sugar_g: number | null;
  fiber_g: number | null;
};

export type SavedKind = "favorite" | "meal" | "recipe";
export type SavedFood = { id: string; kind: SavedKind; name: string; portions: number; items: MealItem[] };

const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown, max = 20000): number | null => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) && x >= 0 && x < max ? x : null;
};

/** Validates untrusted items (form or JSON). Returns null if any item is unusable. */
export function cleanItems(raw: unknown): MealItem[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 60) return null;
  const out: MealItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") return null;
    const o = r as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 160) : "";
    const calories = num(o.calories);
    const protein = num(o.protein_g, 5000) ?? 0;
    const carbs = num(o.carbs_g, 5000) ?? 0;
    const fat = num(o.fat_g, 5000) ?? 0;
    if (!name || calories === null) return null;
    const opt = (v: unknown) => (v === null || v === undefined ? null : num(v, 100000));
    out.push({
      name,
      brand: typeof o.brand === "string" && o.brand.trim() ? o.brand.trim().slice(0, 120) : null,
      amount_label: typeof o.amount_label === "string" && o.amount_label.trim() ? o.amount_label.trim().slice(0, 60) : null,
      calories: r1(calories),
      protein_g: r1(protein),
      carbs_g: r1(carbs),
      fat_g: r1(fat),
      sodium_mg: opt(o.sodium_mg),
      sugar_g: opt(o.sugar_g),
      fiber_g: opt(o.fiber_g),
    });
  }
  return out;
}

export type Totals = { calories: number; protein_g: number; carbs_g: number; fat_g: number; sodium_mg: number; sugar_g: number; fiber_g: number };

export function sumItems(items: Pick<MealItem, "calories" | "protein_g" | "carbs_g" | "fat_g" | "sodium_mg" | "sugar_g" | "fiber_g">[]): Totals {
  const s = (k: keyof Totals) => r1(items.reduce((a, i) => a + Number(i[k] ?? 0), 0));
  return { calories: s("calories"), protein_g: s("protein_g"), carbs_g: s("carbs_g"), fat_g: s("fat_g"), sodium_mg: s("sodium_mg"), sugar_g: s("sugar_g"), fiber_g: s("fiber_g") };
}

/** One portion of a recipe. Sodium, sugar and fibre stay null when no ingredient reported them. */
export function perPortion(items: MealItem[], portions: number): MealItem {
  const p = portions > 0 ? portions : 1;
  const t = sumItems(items);
  const any = (k: "sodium_mg" | "sugar_g" | "fiber_g") => items.some((i) => i[k] !== null);
  return {
    name: "",
    brand: null,
    amount_label: null,
    calories: r1(t.calories / p),
    protein_g: r1(t.protein_g / p),
    carbs_g: r1(t.carbs_g / p),
    fat_g: r1(t.fat_g / p),
    sodium_mg: any("sodium_mg") ? r1(t.sodium_mg / p) : null,
    sugar_g: any("sugar_g") ? r1(t.sugar_g / p) : null,
    fiber_g: any("fiber_g") ? r1(t.fiber_g / p) : null,
  };
}

/** The entries a saved food adds when logged. `portions` only matters for recipes: they log as one entry. */
export function entriesFor(saved: Pick<SavedFood, "kind" | "name" | "portions" | "items">, portions = 1): MealItem[] {
  if (saved.kind === "recipe") {
    const one = perPortion(saved.items, saved.portions);
    const p = portions > 0 ? portions : 1;
    const scale = (v: number | null) => (v === null ? null : r1(v * p));
    return [{ ...one, name: saved.name, amount_label: `${p} × portion`, calories: r1(one.calories * p), protein_g: r1(one.protein_g * p), carbs_g: r1(one.carbs_g * p), fat_g: r1(one.fat_g * p), sodium_mg: scale(one.sodium_mg), sugar_g: scale(one.sugar_g), fiber_g: scale(one.fiber_g) }];
  }
  return saved.items;
}

type Row = { name: string; brand: string | null; calories: number | string; protein_g: number | string; carbs_g: number | string; fat_g: number | string; sodium_mg?: number | string | null; sugar_g?: number | string | null; fiber_g?: number | string | null; amount_label?: string | null; created_at?: string };

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
export const rowToItem = (r: Row): MealItem => ({ name: r.name, brand: r.brand, amount_label: r.amount_label ?? null, calories: Number(r.calories), protein_g: Number(r.protein_g), carbs_g: Number(r.carbs_g), fat_g: Number(r.fat_g), sodium_mg: n(r.sodium_mg), sugar_g: n(r.sugar_g), fiber_g: n(r.fiber_g) });

/** Distinct foods, most recently logged first. `rows` newest first. */
export function recentFoods(rows: Row[], limit = 12): MealItem[] {
  const seen = new Set<string>();
  const out: MealItem[] = [];
  for (const r of rows) {
    const k = `${r.name.toLowerCase()}|${(r.brand ?? "").toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(rowToItem(r));
    if (out.length >= limit) break;
  }
  return out;
}

/** Foods logged most often (ties go to the most recent). `rows` newest first. */
export function frequentFoods(rows: Row[], limit = 12): { item: MealItem; count: number }[] {
  const map = new Map<string, { item: MealItem; count: number; first: number }>();
  rows.forEach((r, i) => {
    const k = `${r.name.toLowerCase()}|${(r.brand ?? "").toLowerCase()}`;
    const cur = map.get(k);
    if (cur) cur.count++;
    else map.set(k, { item: rowToItem(r), count: 1, first: i });
  });
  return [...map.values()].sort((a, b) => b.count - a.count || a.first - b.first).slice(0, limit).map(({ item, count }) => ({ item, count }));
}

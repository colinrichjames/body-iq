"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, field } from "@/components/ui";
import { scaleFood, type Food } from "@/lib/food";
import { perPortion, sumItems, type MealItem } from "@/lib/meals";
import { saveFoodSet } from "./actions";

type Ingredient = { food: Food; servings: number };

const toItem = (i: Ingredient): MealItem => {
  const t = scaleFood(i.food, i.servings);
  return { name: i.food.name, brand: i.food.brand, amount_label: `${i.servings} × ${i.food.servingLabel}`, calories: t.calories, protein_g: t.protein_g, carbs_g: t.carbs_g, fat_g: t.fat_g, sodium_mg: t.sodium_mg, sugar_g: t.sugar_g, fiber_g: t.fiber_g };
};

/** Build a recipe from ingredients (search or by hand), split into portions, and save it for logging later. */
export function RecipeBuilder({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [portions, setPortions] = useState("4");
  const [list, setList] = useState<Ingredient[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [hand, setHand] = useState(false);
  const [saving, setSaving] = useState(false);

  async function search() {
    const term = q.trim();
    if (term.length < 2) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/food/search?q=${encodeURIComponent(term)}`);
      const j = (await res.json()) as { foods?: Food[]; warning?: string | null };
      setResults(j.foods ?? []);
      if (!(j.foods ?? []).length) setNote(j.warning ?? "Nothing found. Try another word or add it by hand.");
    } catch {
      setNote("No connection. Try again.");
    }
    setBusy(false);
  }

  const add = (food: Food) => {
    setList((l) => [...l, { food, servings: 1 }]);
    setResults([]);
    setQ("");
  };

  function addByHand(form: FormData) {
    const n = (k: string) => Number(String(form.get(k) ?? "").trim() || 0);
    const nm = String(form.get("name") ?? "").trim();
    if (!nm) return setNote("Give the ingredient a name.");
    add({ source: "custom", barcode: null, name: nm, brand: null, servingLabel: String(form.get("serving") ?? "").trim() || "1 serving", calories: n("calories"), protein_g: n("protein_g"), carbs_g: n("carbs_g"), fat_g: n("fat_g"), sodium_mg: null, sugar_g: null, fiber_g: null });
    setHand(false);
    setNote(null);
  }

  const items = list.map(toItem);
  const p = Number(portions) > 0 ? Number(portions) : 1;
  const per = items.length ? perPortion(items, p) : null;
  const total = sumItems(items);

  async function save() {
    if (!name.trim()) return setNote("Give the recipe a name.");
    if (!items.length) return setNote("Add at least one ingredient.");
    if (!(Number(portions) > 0)) return setNote("How many portions does it make?");
    setSaving(true);
    const res = await saveFoodSet({ kind: "recipe", name, portions: Number(portions), items });
    setSaving(false);
    if (res.error) return setNote(res.error);
    toast(`Saved ${name.trim()}.`);
    router.refresh();
    onDone();
  }

  return (
    <div className="mt-3 rounded-xl border border-zinc-800 p-3">
      <p className="text-sm font-medium">Build a recipe</p>
      <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Recipe name" placeholder="Recipe name" className={`${field} mt-2`} />
      <label className="mt-2 block text-sm text-zinc-400">
        Makes this many portions
        <input value={portions} onChange={(e) => setPortions(e.target.value)} type="number" inputMode="decimal" step="0.5" min="0.5" className={`${field} mt-1`} />
      </label>

      {list.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-800">
          {list.map((ing, i) => {
            const t = scaleFood(ing.food, ing.servings);
            return (
              <li key={i} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm">{ing.food.name}</span>
                  <button type="button" onClick={() => setList((l) => l.filter((_, j) => j !== i))} className="shrink-0 px-2 text-xs text-zinc-500 active:text-red-400" aria-label={`Remove ${ing.food.name}`}>
                    Remove
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                  <input
                    value={ing.servings}
                    onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, servings: Number(e.target.value) > 0 ? Number(e.target.value) : 0 } : x)))}
                    type="number"
                    inputMode="decimal"
                    step="0.25"
                    min="0"
                    aria-label={`Servings of ${ing.food.name}`}
                    className="w-20 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
                  />
                  <span>
                    × {ing.food.servingLabel} · {Math.round(t.calories)} cal
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void search())}
          aria-label="Search an ingredient"
          placeholder="Search an ingredient"
          className={field}
        />
        <button type="button" onClick={() => void search()} disabled={busy} className={`${btnGhost} shrink-0`}>
          {busy ? "..." : "Search"}
        </button>
      </div>
      <button type="button" onClick={() => setHand((h) => !h)} className="mt-2 text-sm text-emerald-400">
        {hand ? "Cancel" : "Add an ingredient by hand"}
      </button>
      {note && <p className="mt-2 text-sm text-amber-300">{note}</p>}

      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-zinc-800">
          {results.map((f, i) => (
            <li key={`${f.barcode ?? f.name}-${i}`}>
              <button type="button" onClick={() => add(f)} className="flex w-full items-center justify-between gap-3 py-2 text-left">
                <span className="min-w-0 truncate text-sm">
                  {f.name} <span className="text-xs text-zinc-500">{f.servingLabel}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-zinc-400">{Math.round(f.calories)} cal</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {hand && (
        <form action={addByHand} className="mt-2 grid grid-cols-2 gap-2">
          <input name="name" required placeholder="Ingredient" aria-label="Ingredient name" className={`${field} col-span-2`} />
          <input name="serving" placeholder="Serving, e.g. 100 g" aria-label="Serving size" className={`${field} col-span-2`} />
          <input name="calories" type="number" inputMode="decimal" step="any" min="0" required placeholder="Calories" aria-label="Calories per serving" className={field} />
          <input name="protein_g" type="number" inputMode="decimal" step="any" min="0" placeholder="Protein g" aria-label="Protein per serving" className={field} />
          <input name="carbs_g" type="number" inputMode="decimal" step="any" min="0" placeholder="Carbs g" aria-label="Carbs per serving" className={field} />
          <input name="fat_g" type="number" inputMode="decimal" step="any" min="0" placeholder="Fat g" aria-label="Fat per serving" className={field} />
          <button type="submit" className={`${btnPrimary} col-span-2`}>
            Add ingredient
          </button>
        </form>
      )}

      {per && (
        <p className="mt-3 text-sm tabular-nums text-zinc-300">
          Per portion: {Math.round(per.calories)} cal · P {Math.round(per.protein_g)} · C {Math.round(per.carbs_g)} · F {Math.round(per.fat_g)}
          <span className="block text-xs text-zinc-500">Whole recipe {Math.round(total.calories)} cal</span>
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onDone} className={btnGhost}>
          Cancel
        </button>
        <button type="button" onClick={() => void save()} disabled={saving} className={btnPrimary}>
          {saving ? "Saving..." : "Save recipe"}
        </button>
      </div>
    </div>
  );
}

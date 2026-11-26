"use client";

import { useEffect } from "react";
import { btnPrimary, field } from "@/components/ui";
import { macroSplit, ringSegments } from "@/lib/food-stats";
import { scaleFood, type Food } from "@/lib/food";

const R = 42;
const C = 2 * Math.PI * R;
const COLOR = { carbs: "#2dd4bf", fat: "#c084fc", protein: "#fbbf24" } as const;

/**
 * Full-screen "Add Food" overview for the food you picked: name, serving size, number of servings, meal, then the
 * calories in a ring with the carbs / fat / protein split, and fibre, sugar and sodium when the product lists them.
 */
export function FoodOverview({ food, servings, onServings, meal, meals, onMeal, saving, note, onLog, onBack }: { food: Food; servings: string; onServings: (v: string) => void; meal: string; meals: readonly string[]; onMeal: (m: string) => void; saving: boolean; note: string | null; onLog: () => void; onBack: () => void }) {
  const n = Number(servings);
  const t = scaleFood(food, n > 0 ? n : 0);
  const split = macroSplit(t.protein_g, t.carbs_g, t.fat_g);
  const segs = ringSegments(split, C);
  const extras = [
    { label: "Fibre", v: t.fiber_g, unit: " g" },
    { label: "Sugar", v: t.sugar_g, unit: " g" },
    { label: "Sodium", v: t.sodium_mg, unit: " mg" },
  ].filter((x) => x.v !== null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const macros = [
    { key: "carbs" as const, label: "Carbs", g: t.carbs_g, pct: split?.c },
    { key: "fat" as const, label: "Fat", g: t.fat_g, pct: split?.f },
    { key: "protein" as const, label: "Protein", g: t.protein_g, pct: split?.p },
  ];
  const fmt = (v: number) => (Math.round(v * 10) / 10).toString();

  return (
    <div role="dialog" aria-modal="true" aria-label="Add food" className="fixed inset-0 z-30 flex flex-col overflow-y-auto overscroll-contain bg-zinc-950">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onBack} aria-label="Back" className="-ml-2 px-2 py-1 text-2xl text-zinc-200">
          &larr;
        </button>
        <h2 className="text-lg font-semibold">Add Food</h2>
        <button type="button" onClick={onLog} disabled={saving || !(n > 0)} className="-mr-2 px-2 py-1 text-lg font-semibold text-emerald-400 disabled:opacity-40">
          {saving ? "..." : "Log"}
        </button>
      </header>

      <div className="mx-auto w-full max-w-md flex-1 pb-10">
        <div className="border-b border-zinc-800 px-5 py-5">
          <h3 className="text-2xl font-bold leading-tight">{food.name}</h3>
          {food.brand && <p className="mt-1 text-zinc-500">{food.brand}</p>}
        </div>

        <dl className="space-y-3 px-5 py-5">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-zinc-300">Serving Size</dt>
            <dd className="max-w-[60%] rounded-xl border border-zinc-700 px-4 py-2.5 text-right text-emerald-400">{food.servingLabel}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-zinc-300">
              <label htmlFor="servings">Number of Servings</label>
            </dt>
            <dd>
              <input id="servings" value={servings} onChange={(e) => onServings(e.target.value)} type="number" inputMode="decimal" step="0.25" min="0.25" className="w-28 rounded-xl border border-zinc-700 bg-transparent px-4 py-2.5 text-right text-emerald-400 outline-none focus:border-emerald-500" />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-zinc-300">
              <label htmlFor="meal">Meal</label>
            </dt>
            <dd>
              <select id="meal" value={meal} onChange={(e) => onMeal(e.target.value)} className={`${field} !w-auto min-w-36 !bg-transparent text-right text-emerald-400`}>
                {meals.map((m) => (
                  <option key={m} value={m}>
                    {m[0].toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </select>
            </dd>
          </div>
        </dl>

        <section className="flex items-center gap-4 border-t border-zinc-800 px-5 py-6" aria-label="Nutrition for this amount">
          <div className="relative h-28 w-28 shrink-0">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={split ? `Carbs ${split.c} percent, fat ${split.f} percent, protein ${split.p} percent of calories` : "No macros"}>
              <circle cx="50" cy="50" r={R} fill="none" stroke="#27272a" strokeWidth="9" />
              {segs.map((s) => (
                <circle key={s.key} cx="50" cy="50" r={R} fill="none" stroke={COLOR[s.key]} strokeWidth="9" strokeDasharray={s.dash} strokeDashoffset={s.offset} />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold tabular-nums leading-none">{Math.round(t.calories)}</span>
              <span className="text-sm text-zinc-400">cal</span>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-3 text-center">
            {macros.map((m) => (
              <div key={m.key}>
                <p className="text-sm font-semibold tabular-nums" style={{ color: COLOR[m.key] }}>
                  {m.pct ?? 0}%
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">{fmt(m.g)} g</p>
                <p className="text-sm text-zinc-400">{m.label}</p>
              </div>
            ))}
          </div>
        </section>

        {extras.length > 0 && (
          <ul className="mx-5 divide-y divide-zinc-800 rounded-xl border border-zinc-800 text-sm">
            {extras.map((x) => (
              <li key={x.label} className="flex justify-between px-4 py-2.5">
                <span className="text-zinc-400">{x.label}</span>
                <span className="tabular-nums">
                  {fmt(x.v as number)}
                  {x.unit}
                </span>
              </li>
            ))}
          </ul>
        )}

        {note && <p className="mx-5 mt-4 text-sm text-amber-300">{note}</p>}

        <div className="mt-6 px-5">
          <button type="button" onClick={onLog} disabled={saving || !(n > 0)} className={`${btnPrimary} w-full`}>
            {saving ? "Adding..." : `Add to ${meal}`}
          </button>
        </div>
      </div>
    </div>
  );
}

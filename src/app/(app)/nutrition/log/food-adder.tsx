"use client";

import { useToast } from "@/components/toast";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { btnGhost, btnPrimary, card, field } from "@/components/ui";
import { isBarcode, scaleFood, type Food } from "@/lib/food";
import { addFoodEntries, addFoodEntry, copyDay, copyMeal, deleteSavedFood, logSavedFood } from "./actions";
import { RecipeBuilder } from "./recipe-builder";
import { FoodOverview } from "./food-overview";
import { perPortion, type MealItem, type SavedFood } from "@/lib/meals";
import { addDays } from "@/lib/dates";
import { Scanner } from "./scanner";
import { Field } from "@/components/field";

type Tab = "search" | "recent" | "frequent" | "favs" | "meals";
const TABS: { key: Tab; label: string }[] = [
  { key: "search", label: "Search" },
  { key: "recent", label: "Recent" },
  { key: "frequent", label: "Frequent" },
  { key: "favs", label: "Favourites" },
  { key: "meals", label: "Meals" },
];
const itemKey = (i: { name: string; brand: string | null }) => `${i.name.toLowerCase()}|${(i.brand ?? "").toLowerCase()}`;
const foodToItem = (f: Food): MealItem => ({ name: f.name, brand: f.brand, amount_label: `1 × ${f.servingLabel}`, calories: f.calories, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g, sodium_mg: f.sodium_mg, sugar_g: f.sugar_g, fiber_g: f.fiber_g });

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

function defaultMeal(): (typeof MEALS)[number] {
  const h = new Date().getHours();
  return h < 10 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snack";
}

export function FoodAdder({ day, initialMeal, recents, frequent, favourites, meals }: { day: string; initialMeal?: (typeof MEALS)[number]; recents: MealItem[]; frequent: { item: MealItem; count: number }[]; favourites: SavedFood[]; meals: SavedFood[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [meal, setMeal] = useState<(typeof MEALS)[number]>(() => initialMeal ?? defaultMeal());
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [picked, setPicked] = useState<Food | null>(null);
  const [servings, setServings] = useState("1");
  const [manual, setManual] = useState<{ barcode: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("search");
  const [selected, setSelected] = useState<Record<string, MealItem>>({});
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [portions, setPortions] = useState<Record<string, string>>({});
  const [copyFrom, setCopyFrom] = useState(() => addDays(day, -1));
  const [copyWhat, setCopyWhat] = useState<string>("day");

  const selectedList = Object.values(selected);
  const toggle = (item: MealItem) =>
    setSelected((cur) => {
      const k = itemKey(item);
      const next = { ...cur };
      if (k in next) delete next[k];
      else next[k] = item;
      return next;
    });

  async function addSelected() {
    if (!selectedList.length) return;
    setSaving(true);
    const res = await addFoodEntries(day, meal, selectedList);
    setSaving(false);
    if (res.error) return setNote(res.error);
    toast(`Added ${res.added} food${res.added === 1 ? "" : "s"} to ${meal}.`);
    setSelected({});
    setNote(null);
    router.refresh();
  }

  async function logSaved(s: SavedFood) {
    const p = Number(portions[s.id] ?? "1");
    setSaving(true);
    const res = await logSavedFood(s.id, day, meal, p);
    setSaving(false);
    if (res.error) return setNote(res.error);
    toast(`Added ${s.name} to ${meal}.`);
    setNote(null);
    router.refresh();
  }

  async function removeSaved(s: SavedFood) {
    if (!window.confirm(`Delete ${s.name} from your saved foods?`)) return;
    const res = await deleteSavedFood(s.id);
    if (res.error) return setNote(res.error);
    toast(`Deleted ${s.name}.`);
    router.refresh();
  }

  async function copy() {
    setSaving(true);
    const res = copyWhat === "day" ? await copyDay(copyFrom, day) : await copyMeal(copyFrom, copyWhat, day, meal);
    setSaving(false);
    if (res.error) return setNote(res.error);
    toast(`Copied ${res.added} food${res.added === 1 ? "" : "s"}.`);
    setNote(null);
    router.refresh();
  }

  async function lookup(code: string) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/food/barcode?code=${encodeURIComponent(code)}`);
      const j = (await res.json()) as { food?: Food | null; notFound?: boolean; error?: string };
      if (j.food) {
        setPicked(j.food);
        setServings("1");
      } else if (j.notFound) {
        setNote(`Barcode ${code} isn't in Open Food Facts. Enter it once and it's saved for next time.`);
        setManual({ barcode: code });
      } else setNote(j.error ?? "Lookup failed.");
    } catch {
      setNote("No connection. Try again.");
    }
    setBusy(false);
  }

  const onScan = useCallback((code: string) => {
    setScanning(false);
    void lookup(code);
  }, []);

  async function search() {
    const term = q.trim();
    if (isBarcode(term)) return lookup(term);
    if (term.length < 2) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/food/search?q=${encodeURIComponent(term)}`);
      const j = (await res.json()) as { foods?: Food[]; warning?: string | null };
      setResults(j.foods ?? []);
      setNote(j.warning ?? ((j.foods ?? []).length === 0 ? "Nothing found. Try another word, scan it, or add it by hand." : null));
    } catch {
      setNote("No connection. Try again.");
    }
    setBusy(false);
  }

  async function submitPicked() {
    if (!picked) return;
    const s = Number(servings);
    if (!Number.isFinite(s) || s <= 0 || s > 50) return setNote("Enter how many servings.");
    setSaving(true);
    const t = scaleFood(picked, s);
    const res = await addFoodEntry({
      day,
      meal,
      name: picked.name,
      brand: picked.brand,
      barcode: picked.barcode,
      amountLabel: `${s} × ${picked.servingLabel}`,
      ...t,
    });
    setSaving(false);
    if (res.error) return setNote(res.error);
    toast(`Added ${picked.name}.`);
    setPicked(null);
    setResults([]);
    setQ("");
    router.refresh();
  }

  async function reAdd(r: MealItem) {
    const res = await addFoodEntries(day, meal, [{ ...r, amount_label: "again" }]);
    if (res.error) setNote(res.error);
    else {
      toast(`Added ${r.name}.`);
      router.refresh();
    }
  }

  async function submitManual(form: FormData) {
    const num = (k: string) => Number(String(form.get(k) ?? "").trim() || 0);
    const sv = Math.max(0.1, Number(String(form.get("servings") ?? "1")) || 1);
    const per = { calories: num("calories"), protein_g: num("protein_g"), carbs_g: num("carbs_g"), fat_g: num("fat_g") };
    setSaving(true);
    const res = await addFoodEntry({
      day,
      meal,
      name: String(form.get("name") ?? ""),
      brand: String(form.get("brand") ?? "") || null,
      barcode: manual?.barcode ?? null,
      amountLabel: `${sv} × ${String(form.get("serving_label") ?? "serving") || "serving"}`,
      calories: per.calories * sv,
      protein_g: per.protein_g * sv,
      carbs_g: per.carbs_g * sv,
      fat_g: per.fat_g * sv,
      saveCustom: form.get("remember") ? { servingLabel: String(form.get("serving_label") ?? "") || "1 serving", perServing: per } : null,
    });
    setSaving(false);
    if (res.error) return setNote(res.error);
    toast(`Added ${String(form.get("name") ?? "food")}.`);
    setManual(null);
    setNote(null);
    router.refresh();
  }


  return (
    <section id="add" className={`${card} mt-5 scroll-mt-4`}>
      <h2 className="font-medium">Add food</h2>
      <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-zinc-900 p-1 text-xs">
        {MEALS.map((m) => (
          <button key={m} type="button" onClick={() => setMeal(m)} className={`rounded-lg py-2 capitalize ${meal === m ? "bg-emerald-500 font-medium text-zinc-950" : "text-zinc-400"}`}>
            {m}
          </button>
        ))}
      </div>

      {!picked && !manual && (
        <div className="mt-3 flex gap-1 overflow-x-auto text-xs" role="tablist" aria-label="Where to find food">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={`shrink-0 rounded-full px-3 py-1.5 ${tab === t.key ? "bg-zinc-200 font-medium text-zinc-900" : "border border-zinc-700 text-zinc-400"}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {!picked && !manual && tab === "search" && (
        <>
          <div className="mt-3 flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void search())}
              aria-label="Search a food or type a barcode"
              placeholder="Search a food or type a barcode"
              className={field}
            />
            <button type="button" onClick={() => void search()} disabled={busy} className={`${btnGhost} shrink-0`}>
              {busy ? "..." : "Search"}
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setScanning((s) => !s)} className={`${btnPrimary} flex-1`}>
              {scanning ? "Stop scanning" : "Scan barcode"}
            </button>
            <button type="button" onClick={() => setManual({ barcode: null })} className={`${btnGhost} flex-1`}>
              Add by hand
            </button>
          </div>
          {scanning && <Scanner onCode={onScan} onClose={() => setScanning(false)} />}
        </>
      )}

      {note && !picked && <p className="mt-3 text-sm text-amber-300">{note}</p>}

      {!picked && !manual && tab === "search" && results.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-800">
          {results.map((f, i) => (
            <li key={`${f.barcode ?? f.name}-${i}`} className="flex items-center gap-2">
              <input type="checkbox" checked={itemKey(f) in selected} onChange={() => toggle(foodToItem(f))} aria-label={`Select ${f.name}`} className="h-5 w-5 shrink-0" />
              <button type="button" onClick={() => (setPicked(f), setServings("1"))} className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 text-left">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{f.name}</span>
                  <span className="block truncate text-xs text-zinc-500">
                    {f.source === "custom" ? "Saved · " : ""}
                    {f.brand ? `${f.brand} · ` : ""}
                    {f.servingLabel}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-zinc-400">{Math.round(f.calories)} cal</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!picked && !manual && tab === "recent" && <ItemList items={recents.map((item) => ({ item }))} empty="Nothing logged in the last 30 days yet." meal={meal} selected={selected} onToggle={toggle} onAdd={(i) => void reAdd(i)} />}
      {!picked && !manual && tab === "frequent" && <ItemList items={frequent.map((f) => ({ item: f.item, extra: `${f.count}×` }))} empty="Foods you log more than once show up here." meal={meal} selected={selected} onToggle={toggle} onAdd={(i) => void reAdd(i)} />}
      {!picked && !manual && tab === "favs" && (
        <ItemList
          items={favourites.map((f) => ({ item: { ...f.items[0], name: f.name }, id: f.id }))}
          empty="Tap Favourite on a logged food to keep it here."
          meal={meal}
          selected={selected}
          onToggle={toggle}
          onAdd={(i) => void reAdd(i)}
          onRemove={(id) => {
            const f = favourites.find((x) => x.id === id);
            if (f) void removeSaved(f);
          }}
        />
      )}

      {!picked && !manual && tab === "meals" && (
        <div className="mt-3 space-y-4">
          {meals.length === 0 ? (
            <p className="text-sm text-zinc-500">Save a meal from your log, or build a recipe, and it shows up here.</p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {meals.map((m) => {
                const per = m.kind === "recipe" ? perPortion(m.items, m.portions) : null;
                const cal = per ? per.calories : m.items.reduce((a, i) => a + i.calories, 0);
                return (
                  <li key={m.id} className="py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{m.name}</p>
                        <p className="text-xs text-zinc-500">
                          {m.kind === "recipe" ? `Recipe · ${m.portions} portions · ${Math.round(cal)} cal each` : `${m.items.length} food${m.items.length === 1 ? "" : "s"} · ${Math.round(cal)} cal`}
                        </p>
                      </div>
                      <button type="button" onClick={() => void removeSaved(m)} className="shrink-0 px-2 text-xs text-zinc-500 active:text-red-400" aria-label={`Delete ${m.name}`}>
                        Delete
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {m.kind === "recipe" && (
                        <label className="flex items-center gap-1 text-xs text-zinc-500">
                          Portions
                          <input value={portions[m.id] ?? "1"} onChange={(e) => setPortions((p) => ({ ...p, [m.id]: e.target.value }))} type="number" inputMode="decimal" step="0.25" min="0.25" className="w-16 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100" />
                        </label>
                      )}
                      <button type="button" onClick={() => void logSaved(m)} disabled={saving} className={`${btnGhost} ml-auto px-3 py-1.5 text-sm`}>
                        Add to {meal}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {recipeOpen ? (
            <RecipeBuilder onDone={() => setRecipeOpen(false)} />
          ) : (
            <button type="button" onClick={() => setRecipeOpen(true)} className={`${btnGhost} w-full`}>
              Build a recipe
            </button>
          )}

          <div className="rounded-xl border border-zinc-800 p-3">
            <p className="text-sm font-medium">Copy from another day</p>
            <label className="mt-2 block text-sm text-zinc-400">
              Day
              <input type="date" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} max={day} className={`${field} mt-1`} />
            </label>
            <label className="mt-2 block text-sm text-zinc-400">
              Copy
              <select value={copyWhat} onChange={(e) => setCopyWhat(e.target.value)} className={`${field} mt-1`}>
                <option value="day">The whole day (every meal)</option>
                {MEALS.map((m) => (
                  <option key={m} value={m}>
                    Their {m}, into my {meal}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => void copy()} disabled={saving || !copyFrom} className={`${btnGhost} mt-3 w-full`}>
              {saving ? "Copying..." : "Copy"}
            </button>
          </div>
        </div>
      )}

      {selectedList.length > 0 && !picked && !manual && (
        <div className="sticky bottom-28 z-10 mt-4 flex gap-2 rounded-xl border border-emerald-700 bg-zinc-950 p-2">
          <button type="button" onClick={() => setSelected({})} className={`${btnGhost} px-3 py-2 text-sm`}>
            Clear
          </button>
          <button type="button" onClick={() => void addSelected()} disabled={saving} className={`${btnPrimary} flex-1 py-2`}>
            {saving ? "Adding..." : `Add ${selectedList.length} to ${meal}`}
          </button>
        </div>
      )}

      {picked && (
        <FoodOverview food={picked} servings={servings} onServings={setServings} meal={meal} meals={MEALS} onMeal={(m) => setMeal(m as (typeof MEALS)[number])} saving={saving} note={note} onLog={() => void submitPicked()} onBack={() => (setPicked(null), setNote(null))} />
      )}

      {manual && (
        <form action={submitManual} className="mt-4 space-y-3">
          {manual.barcode && <p className="text-xs text-zinc-500">Barcode {manual.barcode}</p>}
          <Field label="Food name"><input name="name" required className={field} /></Field>
          <Field label="Brand (optional)"><input name="brand" className={field} /></Field>
          <Field label="Serving size"><input name="serving_label" placeholder="e.g. 1 bar or 40 g" className={field} /></Field>
          <p className="text-xs text-zinc-500">Nutrition per one serving:</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Calories"><input name="calories" type="number" inputMode="decimal" step="any" min="0" required className={field} /></Field>
            <Field label="Protein (g)"><input name="protein_g" type="number" inputMode="decimal" step="any" min="0" className={field} /></Field>
            <Field label="Carbs (g)"><input name="carbs_g" type="number" inputMode="decimal" step="any" min="0" className={field} /></Field>
            <Field label="Fat (g)"><input name="fat_g" type="number" inputMode="decimal" step="any" min="0" className={field} /></Field>
          </div>
          <input name="servings" type="number" inputMode="decimal" step="0.25" min="0.25" defaultValue="1" className={field} aria-label="Servings eaten" />
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input name="remember" type="checkbox" defaultChecked className="h-4 w-4" />
            Save this food for next time{manual.barcode ? " (linked to the barcode)" : ""}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => (setManual(null), setNote(null))} className={btnGhost}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? "Adding..." : `Add to ${meal}`}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function ItemList({ items, empty, meal, selected, onToggle, onAdd, onRemove }: { items: { item: MealItem; extra?: string; id?: string }[]; empty: string; meal: string; selected: Record<string, MealItem>; onToggle: (i: MealItem) => void; onAdd: (i: MealItem) => void; onRemove?: (id: string) => void }) {
  if (!items.length) return <p className="mt-3 text-sm text-zinc-500">{empty}</p>;
  return (
    <div className="mt-3">
      <p className="text-xs text-zinc-500">Tap a food to add it to {meal}, or tick several and add them together.</p>
      <ul className="mt-1 divide-y divide-zinc-800">
        {items.map(({ item, extra, id }, i) => (
          <li key={`${itemKey(item)}-${i}`} className="flex items-center gap-2">
            <input type="checkbox" checked={itemKey(item) in selected} onChange={() => onToggle(item)} aria-label={`Select ${item.name}`} className="h-5 w-5 shrink-0" />
            <button type="button" onClick={() => onAdd(item)} className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 text-left">
              <span className="truncate text-sm">
                {item.name}
                {extra && <span className="ml-1 text-xs text-zinc-500">{extra}</span>}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                {Math.round(item.calories)} cal · {Math.round(item.protein_g)}P
              </span>
            </button>
            {id && onRemove && (
              <button type="button" onClick={() => onRemove(id)} className="shrink-0 px-2 text-xs text-zinc-500 active:text-red-400" aria-label={`Remove ${item.name} from favourites`}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

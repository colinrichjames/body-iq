"use client";

import { useToast } from "@/components/toast";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { btnGhost, btnPrimary, card, field } from "@/components/ui";
import { isBarcode, scaleFood, type Food } from "@/lib/food";
import { addFoodEntry } from "./actions";
import { Scanner } from "./scanner";

export type Recent = { name: string; brand: string | null; calories: number; protein_g: number; carbs_g: number; fat_g: number };

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

function defaultMeal(): (typeof MEALS)[number] {
  const h = new Date().getHours();
  return h < 10 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snack";
}

export function FoodAdder({ day, recents }: { day: string; recents: Recent[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [meal, setMeal] = useState<(typeof MEALS)[number]>(defaultMeal);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [picked, setPicked] = useState<Food | null>(null);
  const [servings, setServings] = useState("1");
  const [manual, setManual] = useState<{ barcode: string | null } | null>(null);
  const [saving, setSaving] = useState(false);

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

  async function reAdd(r: Recent) {
    const res = await addFoodEntry({ day, meal, name: r.name, brand: r.brand, calories: r.calories, protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g, amountLabel: "again" });
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

  const scaled = picked ? scaleFood(picked, Number(servings) > 0 ? Number(servings) : 0) : null;

  return (
    <section className={`${card} mt-5`}>
      <h2 className="font-medium">Add food</h2>
      <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-zinc-900 p-1 text-xs">
        {MEALS.map((m) => (
          <button key={m} type="button" onClick={() => setMeal(m)} className={`rounded-lg py-2 capitalize ${meal === m ? "bg-emerald-500 font-medium text-zinc-950" : "text-zinc-400"}`}>
            {m}
          </button>
        ))}
      </div>

      {!picked && !manual && (
        <>
          <div className="mt-3 flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void search())}
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

      {note && <p className="mt-3 text-sm text-amber-300">{note}</p>}

      {!picked && !manual && results.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-800">
          {results.map((f, i) => (
            <li key={`${f.barcode ?? f.name}-${i}`}>
              <button type="button" onClick={() => (setPicked(f), setServings("1"))} className="flex w-full items-center justify-between gap-3 py-2.5 text-left">
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

      {!picked && !manual && results.length === 0 && recents.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-zinc-500">Eat often? Tap to add again to {meal}.</p>
          <ul className="mt-1 divide-y divide-zinc-800">
            {recents.map((r, i) => (
              <li key={i}>
                <button type="button" onClick={() => void reAdd(r)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left">
                  <span className="truncate text-sm">{r.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                    {Math.round(r.calories)} cal · {Math.round(r.protein_g)}P
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {picked && scaled && (
        <div className="mt-4">
          <p className="font-medium">{picked.name}</p>
          <p className="text-xs text-zinc-500">
            {picked.brand ? `${picked.brand} · ` : ""}1 serving = {picked.servingLabel}
          </p>
          <label className="mt-3 block text-sm text-zinc-400">
            Servings
            <input value={servings} onChange={(e) => setServings(e.target.value)} type="number" inputMode="decimal" step="0.25" min="0.25" className={`${field} mt-1 text-xl`} />
          </label>
          <p className="mt-3 text-sm tabular-nums text-zinc-300">
            {Math.round(scaled.calories)} cal · P {Math.round(scaled.protein_g)} g · C {Math.round(scaled.carbs_g)} g · F {Math.round(scaled.fat_g)} g
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPicked(null)} className={btnGhost}>
              Back
            </button>
            <button type="button" onClick={() => void submitPicked()} disabled={saving} className={btnPrimary}>
              {saving ? "Adding..." : `Add to ${meal}`}
            </button>
          </div>
        </div>
      )}

      {manual && (
        <form action={submitManual} className="mt-4 space-y-3">
          {manual.barcode && <p className="text-xs text-zinc-500">Barcode {manual.barcode}</p>}
          <input name="name" required placeholder="Food name" className={field} />
          <input name="brand" placeholder="Brand (optional)" className={field} />
          <input name="serving_label" placeholder="One serving is, e.g. 1 bar or 40 g" className={field} />
          <p className="text-xs text-zinc-500">Nutrition per one serving:</p>
          <div className="grid grid-cols-2 gap-3">
            <input name="calories" type="number" inputMode="decimal" step="any" min="0" required placeholder="Calories" className={field} />
            <input name="protein_g" type="number" inputMode="decimal" step="any" min="0" placeholder="Protein (g)" className={field} />
            <input name="carbs_g" type="number" inputMode="decimal" step="any" min="0" placeholder="Carbs (g)" className={field} />
            <input name="fat_g" type="number" inputMode="decimal" step="any" min="0" placeholder="Fat (g)" className={field} />
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

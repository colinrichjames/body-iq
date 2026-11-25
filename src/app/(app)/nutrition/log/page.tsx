import { ConfirmButton } from "@/components/confirm-button";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { addDays, formatDay, isIsoDate } from "@/lib/dates";
import { getToday } from "@/lib/today";
import { targetsFor } from "@/lib/targets";
import { card } from "@/components/ui";
import type { Profile, Workout } from "@/lib/types";
import { deleteFoodEntry } from "./actions";
import { FoodAdder, type Recent } from "./food-adder";

type Entry = {
  id: string;
  day: string;
  meal: string;
  name: string;
  brand: string | null;
  amount_label: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  created_at: string;
};

const MEALS = ["breakfast", "lunch", "dinner", "snack"];

export default async function FoodLogPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const { supabase, userId } = await requireUser();
  const today = await getToday();
  const day = d && isIsoDate(d) ? d : today;

  const [{ data: entries }, { data: recentRows }, { data: profile }, { data: wk }] = await Promise.all([
    supabase.from("food_entries").select("*").eq("day", day).order("created_at").returns<Entry[]>(),
    supabase.from("food_entries").select("name,brand,calories,protein_g,carbs_g,fat_g").gte("day", addDays(today, -30)).order("created_at", { ascending: false }).limit(150),
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>(),
    supabase.from("workouts").select("*").eq("workout_date", day).returns<Workout[]>(),
  ]);
  const list = entries ?? [];

  // Foods eaten most often in the last 30 days.
  const counts = new Map<string, { n: number; r: Recent }>();
  for (const r of recentRows ?? []) {
    const k = `${r.name}|${r.brand ?? ""}`;
    const cur = counts.get(k);
    if (cur) cur.n++;
    else counts.set(k, { n: 1, r: { name: r.name, brand: r.brand, calories: Number(r.calories), protein_g: Number(r.protein_g), carbs_g: Number(r.carbs_g), fat_g: Number(r.fat_g) } });
  }
  const recents = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 6).map((x) => x.r);

  const total = (k: "calories" | "protein_g" | "carbs_g" | "fat_g") => list.reduce((a, e) => a + Number(e[k]), 0);
  const t = targetsFor(day, wk ?? [], profile ?? null);
  const rows = [
    { label: "Calories", v: total("calories"), target: t.calories, unit: "" },
    { label: "Protein", v: total("protein_g"), target: t.protein, unit: " g" },
    { label: "Carbs", v: total("carbs_g"), target: t.carbs, unit: " g" },
    { label: "Fat", v: total("fat_g"), target: t.fat, unit: " g" },
  ];

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8">
      <Link href="/nutrition" className="text-sm text-zinc-400">
        &larr; Nutrition
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Food log</h1>
      <div className="mt-3 flex items-center justify-between text-sm">
        <Link href={`/nutrition/log?d=${addDays(day, -1)}`} className="px-2 py-1 text-zinc-400">
          &larr;
        </Link>
        <Link href="/nutrition/log" className="text-zinc-200">
          {formatDay(day)}
          {day === today ? " · today" : ""}
        </Link>
        <Link href={`/nutrition/log?d=${addDays(day, 1)}`} className="px-2 py-1 text-zinc-400">
          &rarr;
        </Link>
      </div>

      <section className={`${card} mt-4`}>
        <div className="grid grid-cols-2 gap-4">
          {rows.map((r) => (
            <div key={r.label}>
              <p className="text-xs text-zinc-500">{r.label}</p>
              <p className="text-xl font-semibold tabular-nums">
                {Math.round(r.v)}
                <span className="text-sm font-normal text-zinc-500">{r.unit}</span>
              </p>
              <p className="text-xs text-zinc-500">{r.target ? `of ${Math.round(r.target)}${r.unit} · ${Math.round(r.target - r.v)}${r.unit} left` : "no target"}</p>
            </div>
          ))}
        </div>
        {(wk ?? []).length > 0 && <p className="mt-3 text-xs text-zinc-500">Training day target applies.</p>}
      </section>

      <FoodAdder key={day + list.length} day={day} recents={recents} />

      {MEALS.map((m) => {
        const items = list.filter((e) => e.meal === m);
        if (items.length === 0) return null;
        return (
          <section key={m} className="mt-5">
            <h2 className="flex justify-between text-xs font-medium uppercase tracking-wider text-zinc-500">
              <span>{m}</span>
              <span className="tabular-nums">{Math.round(items.reduce((a, e) => a + Number(e.calories), 0))} cal</span>
            </h2>
            <ul className="mt-1 divide-y divide-zinc-800 rounded-xl border border-zinc-800">
              {items.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{e.name}</p>
                    <p className="text-xs text-zinc-500">
                      {e.amount_label ? `${e.amount_label} · ` : ""}
                      {Math.round(Number(e.calories))} cal · P {Math.round(Number(e.protein_g))} · C {Math.round(Number(e.carbs_g))} · F {Math.round(Number(e.fat_g))}
                    </p>
                  </div>
                  <form action={deleteFoodEntry}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="day" value={day} />
                    <ConfirmButton message={`Remove ${e.name}? You can undo right after.`} className="px-2 py-1 text-xs text-zinc-500 active:text-red-400">
                      Remove
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}

import { ConfirmButton } from "@/components/confirm-button";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { addDays, formatDay, isIsoDate } from "@/lib/dates";
import { getToday } from "@/lib/today";
import { isTrainingDay, remainingText, targetsFor } from "@/lib/targets";
import { card } from "@/components/ui";
import type { Profile, Workout } from "@/lib/types";
import { addWater, deleteFoodEntry, favoriteEntry, finishDay, reopenDay } from "./actions";
import { hydrationTarget } from "@/lib/fuel";
import { FoodAdder } from "./food-adder";
import { SaveMeal } from "./save-meal";
import { frequentFoods, recentFoods, sumItems, type SavedFood, type MealItem } from "@/lib/meals";
import { loggingStreak, macroSplit, micronutrients } from "@/lib/food-stats";

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
  sodium_mg: number | null;
  sugar_g: number | null;
  fiber_g: number | null;
  created_at: string;
};

const MEALS = ["breakfast", "lunch", "dinner", "snack", "other"];
const MEAL_LABEL: Record<string, string> = { other: "Day totals" };

export default async function FoodLogPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const { supabase, userId } = await requireUser();
  const today = await getToday();
  const day = d && isIsoDate(d) ? d : today;

  const [{ data: entries }, { data: recentRows }, { data: profile }, { data: wk }, { data: water }, { data: scan }, { data: savedRows }, { data: finishedRows }] = await Promise.all([
    supabase.from("food_entries").select("*").eq("day", day).order("created_at").returns<Entry[]>(),
    supabase.from("food_entries").select("name,brand,amount_label,calories,protein_g,carbs_g,fat_g,sodium_mg,sugar_g,fiber_g,created_at").neq("meal", "other").gte("day", addDays(today, -45)).order("created_at", { ascending: false }).limit(400),
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>(),
    supabase.from("workouts").select("*").eq("workout_date", day).returns<Workout[]>(),
    supabase.from("hydration_days").select("ml").eq("day", day).maybeSingle<{ ml: number }>(),
    supabase.from("body_scans").select("weight_lb").not("weight_lb", "is", null).order("scanned_at", { ascending: false }).limit(1).maybeSingle<{ weight_lb: number }>(),
    supabase.from("saved_foods").select("id,kind,name,portions,items").order("created_at", { ascending: false }).returns<SavedFood[]>(),
    supabase.from("day_finishes").select("day").gte("day", addDays(today, -400)).returns<{ day: string }[]>(),
  ]);
  const list = entries ?? [];

  const rowsForLists = (recentRows ?? []) as unknown as Parameters<typeof recentFoods>[0];
  const recents = recentFoods(rowsForLists, 15);
  const frequent = frequentFoods(rowsForLists, 15);
  const saved = savedRows ?? [];
  const favourites = saved.filter((x) => x.kind === "favorite");
  const meals = saved.filter((x) => x.kind !== "favorite");
  const finished = (finishedRows ?? []).map((r) => r.day);
  const streak = loggingStreak(finished, today);
  const dayDone = finished.includes(day);

  const total = (k: "calories" | "protein_g" | "carbs_g" | "fat_g") => list.reduce((a, e) => a + Number(e[k]), 0);
  const t = targetsFor(day, wk ?? [], profile ?? null);
  const trainingDay = isTrainingDay(day, wk ?? []);
  const waterMl = water?.ml ?? 0;
  const trainingMin = (wk ?? []).filter((x) => x.status !== "skipped" && x.sport !== "mobility").reduce((a, x) => a + (x.actual_duration_min ?? x.planned_duration_min ?? 0), 0);
  const waterTarget = hydrationTarget(scan?.weight_lb ? Number(scan.weight_lb) * 0.45359237 : null, trainingMin);
  const sessionFluid = (wk ?? []).reduce((a, x) => a + (x.fluid_ml ?? 0), 0);
  const rows = [
    { label: "Calories", v: total("calories"), target: t.calories, unit: "" },
    { label: "Protein", v: total("protein_g"), target: t.protein, unit: " g" },
    { label: "Carbs", v: total("carbs_g"), target: t.carbs, unit: " g" },
    { label: "Fat", v: total("fat_g"), target: t.fat, unit: " g" },
  ];

  const sums = sumItems(list as unknown as MealItem[]);
  const split = macroSplit(sums.protein_g, sums.carbs_g, sums.fat_g);
  const goalSplit = t.protein !== null && t.carbs !== null && t.fat !== null ? macroSplit(t.protein, t.carbs, t.fat) : null;
  const micros = micronutrients(sums, t.calories);
  const left = t.calories !== null ? Math.round(t.calories - sums.calories) : null;

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
        {left !== null && (
          <div className="mb-4 border-b border-zinc-800 pb-4">
            <p className="text-xs text-zinc-500">Calories remaining</p>
            <p className={`text-4xl font-semibold tabular-nums ${left < 0 ? "text-amber-300" : "text-zinc-100"}`}>{left < 0 ? `${(-left).toLocaleString("en-US")} over` : left.toLocaleString("en-US")}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {Math.round(t.calories ?? 0).toLocaleString("en-US")} target &minus; {Math.round(sums.calories).toLocaleString("en-US")} eaten
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          {rows.map((r) => (
            <div key={r.label}>
              <p className="text-xs text-zinc-500">{r.label}</p>
              <p className="text-xl font-semibold tabular-nums">
                {Math.round(r.v)}
                <span className="text-sm font-normal text-zinc-500">{r.unit}</span>
              </p>
              <p className="text-xs text-zinc-500">{r.target ? `of ${Math.round(r.target)}${r.unit} · ${remainingText(r.target, r.v, r.unit)}` : "no target"}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">{trainingDay ? "Training day targets apply." : "Rest day targets apply."}</p>
      </section>

      {split && (
        <section className={`${card} mt-4`}>
          <h2 className="text-sm text-zinc-400">Where your calories come from</h2>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-zinc-800" role="img" aria-label={`Protein ${split.p} percent, carbs ${split.c} percent, fat ${split.f} percent`}>
            <div className="bg-emerald-400" style={{ width: `${split.p}%` }} />
            <div className="bg-sky-400" style={{ width: `${split.c}%` }} />
            <div className="bg-amber-400" style={{ width: `${split.f}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-3 text-center text-sm">
            {[
              { label: "Protein", v: split.p, goal: goalSplit?.p },
              { label: "Carbs", v: split.c, goal: goalSplit?.c },
              { label: "Fat", v: split.f, goal: goalSplit?.f },
            ].map((m) => (
              <div key={m.label}>
                <p className="text-xs text-zinc-500">{m.label}</p>
                <p className="font-semibold tabular-nums">{m.v}%</p>
                {m.goal !== undefined && <p className="text-xs text-zinc-500">goal {m.goal}%</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {list.length > 0 && (
        <section className={`${card} mt-4`}>
          <h2 className="text-sm text-zinc-400">Micronutrients</h2>
          <ul className="mt-2 divide-y divide-zinc-800 text-sm">
            {micros.map((m) => (
              <li key={m.key} className="flex items-baseline justify-between py-2">
                <span>
                  {m.label} <span className="text-xs text-zinc-500">{m.goal}</span>
                </span>
                <span className={`tabular-nums ${m.status === "high" ? "text-amber-300" : m.status === "low" ? "text-zinc-400" : "text-zinc-200"}`}>
                  {m.value}
                  {m.unit}
                  {m.status === "high" ? " · over" : m.status === "low" ? " · low" : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">Only foods that list these nutrients count, so a day with hand-entered foods reads low. If you sweat a lot, you may need more sodium than the limit.</p>
        </section>
      )}

      <section className={`${card} mt-4`}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm text-zinc-400">Water</h2>
          <p className="text-sm tabular-nums text-zinc-300">
            {(waterMl / 1000).toFixed(2).replace(/0$/, "")} L <span className="text-zinc-500">of {(waterTarget / 1000).toFixed(2).replace(/0$/, "")} L</span>
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-label="Water today" aria-valuemin={0} aria-valuemax={waterTarget} aria-valuenow={waterMl}>
          <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.min(100, Math.round((waterMl / waterTarget) * 100))}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[-250, 250, 500, 750].map((ml) => (
            <form key={ml} action={addWater}>
              <input type="hidden" name="day" value={day} />
              <input type="hidden" name="ml" value={ml} />
              <button type="submit" disabled={ml < 0 && waterMl === 0} className="w-full rounded-lg border border-zinc-700 py-2 text-sm text-zinc-200 active:bg-zinc-800 disabled:opacity-30" aria-label={ml < 0 ? "Remove 250 millilitres" : `Add ${ml} millilitres`}>
                {ml < 0 ? "-250" : `+${ml}`}
              </button>
            </form>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Target is about 35 ml per kg of body weight{trainingMin > 0 ? ` plus 500 ml per hour of training (${Math.round(trainingMin)} min today)` : ""}.
          {sessionFluid > 0 ? ` You logged ${sessionFluid} ml during training; count it here if you want it in the total.` : ""} Amounts in ml; a typical bottle is 500 to 750.
        </p>
      </section>

      <FoodAdder key={day + list.length} day={day} recents={recents} frequent={frequent} favourites={favourites} meals={meals} />

      {MEALS.map((m) => {
        const items = list.filter((e) => e.meal === m);
        if (items.length === 0) return null;
        return (
          <section key={m} className="mt-5">
            <h2 className="flex flex-wrap items-center justify-between gap-x-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
              <span>{MEAL_LABEL[m] ?? m}</span>
              <span className="flex items-center gap-3">
                {m !== "other" && <SaveMeal day={day} meal={m} />}
                <span className="tabular-nums">{Math.round(items.reduce((a, e) => a + Number(e.calories), 0))} cal</span>
              </span>
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
                  <div className="flex shrink-0 items-center">
                  {e.meal !== "other" && (
                    <form action={favoriteEntry}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="day" value={day} />
                      <button type="submit" className="px-2 py-1 text-xs text-zinc-500 active:text-emerald-400" aria-label={`Save ${e.name} to Favourites`}>
                        Favourite
                      </button>
                    </form>
                  )}
                  <form action={deleteFoodEntry}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="day" value={day} />
                    <ConfirmButton message={`Remove ${e.name}? You can undo right after.`} className="px-2 py-1 text-xs text-zinc-500 active:text-red-400">
                      Remove
                    </ConfirmButton>
                  </form>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className={`${card} mt-6`}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm text-zinc-400">Logging streak</h2>
          <p className="text-sm tabular-nums text-zinc-200">
            {streak.current} day{streak.current === 1 ? "" : "s"}
            <span className="text-zinc-500"> · best {streak.longest}</span>
          </p>
        </div>
        <p className="mt-1 text-xs text-zinc-500">Finish a day once everything you ate is logged. A finished day keeps the streak going; a day you skip ends it.</p>
        {dayDone ? (
          <form action={reopenDay} className="mt-3">
            <input type="hidden" name="day" value={day} />
            <p className="text-sm text-emerald-400">This day is finished.</p>
            <button type="submit" className="mt-2 text-xs text-zinc-500 underline">
              Reopen it
            </button>
          </form>
        ) : (
          <form action={finishDay} className="mt-3">
            <input type="hidden" name="day" value={day} />
            <button type="submit" disabled={list.length === 0} className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-medium text-zinc-950 active:bg-emerald-400 disabled:opacity-40">
              Finish day
            </button>
            {list.length === 0 && <p className="mt-2 text-xs text-zinc-500">Log a food first.</p>}
          </form>
        )}
      </section>
    </main>
  );
}

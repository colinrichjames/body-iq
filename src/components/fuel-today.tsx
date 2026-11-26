import Link from "next/link";
import type { ReactNode } from "react";
import { addDays, formatDay } from "@/lib/dates";
import { DIARY_MEALS, fillPct, mealSummary, sundayWeek, type DiaryMeal } from "@/lib/diary";
import { logYesterdayMeal } from "@/app/(app)/nutrition/log/actions";

export type DiaryItem = { name: string; calories: number };
export type FuelTodayProps = {
  day: string;
  today: string;
  /** Days marked finished, ISO dates. */
  finished: string[];
  streak: number;
  targets: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null };
  totals: { calories: number; protein: number; carbs: number; fat: number };
  /** What was logged on `day`, by meal (day totals are under "other"). */
  meals: Record<string, DiaryItem[]>;
  /** Food names from the day before, by meal, for "log yesterday's again". */
  yesterday: Record<string, string[]>;
  /** True when no weight is logged for `day`. */
  needsWeight: boolean;
};

const MEAL_ICON: Record<DiaryMeal | "other", ReactNode> = {
  breakfast: <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Zm13 1h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3m4-3v3" />,
  lunch: <path d="M4 11a8 8 0 0 1 16 0H4Zm-1 3h18M5 17h14a0 0 0 0 1 0 0 3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z" />,
  dinner: <path d="M3 11h18a9 9 0 0 1-18 0Zm6-6 6 5M12 21v-1" />,
  snack: <><path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5 4 4 0 0 0 20.5 13.5Z" /><path d="M9 12h.01M13 16h.01M14 10h.01M8 16h.01" /></>,
  other: <path d="M5 12h14M5 7h14M5 17h14" />,
};

const Icon = ({ name }: { name: DiaryMeal | "other" }) => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {MEAL_ICON[name]}
  </svg>
);

function Bar({ value, target, color, label }: { value: number; target: number | null; color: string; label: string }) {
  const over = target !== null && target > 0 && value > target;
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={target ?? 0} aria-valuenow={Math.round(value)}>
      <div className={`h-full rounded-full ${over ? "bg-amber-400" : color}`} style={{ width: `${fillPct(value, target)}%` }} />
    </div>
  );
}

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/** The Fuel tab's top half: week strip, calories, macros and the four meals, in the style of a food diary. */
export function FuelToday({ day, today, finished, streak, targets, totals, meals, yesterday, needsWeight }: FuelTodayProps) {
  const week = sundayWeek(day);
  const done = new Set(finished);
  const left = targets.calories !== null ? Math.round(targets.calories - totals.calories) : null;
  const title = day === today ? "Today" : day === addDays(today, -1) ? "Yesterday" : day === addDays(today, 1) ? "Tomorrow" : formatDay(day);
  const logHref = (meal?: string) => {
    const q = [day !== today ? `d=${day}` : null, meal ? `meal=${meal}` : null].filter(Boolean).join("&");
    return `/nutrition/log${q ? `?${q}` : ""}#add`;
  };

  return (
    <>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {title !== formatDay(day) && <p className="text-sm text-zinc-500">{formatDay(day)}</p>}
        </div>
        <Link href="/nutrition/log" className="pb-1 text-sm text-emerald-400">
          Food diary
        </Link>
      </div>

      <section className="mt-5" aria-label="This week">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <Link href={`/nutrition?d=${addDays(day, -7)}`} className="px-2 py-1" aria-label="Previous week">
            &larr;
          </Link>
          <span>
            {formatDay(week[0], { weekday: false })} &ndash; {formatDay(week[6], { weekday: false })}
          </span>
          <Link href={`/nutrition?d=${addDays(day, 7)}`} className="px-2 py-1" aria-label="Next week">
            &rarr;
          </Link>
        </div>
        <div className="mt-2 flex items-center">
          <ol className="flex flex-1 justify-between">
            {week.map((d, i) => {
              const isDone = done.has(d);
              const selected = d === day;
              return (
                <li key={d}>
                  <Link href={d === today ? "/nutrition" : `/nutrition?d=${d}`} className="flex flex-col items-center gap-1.5" aria-label={`${formatDay(d)}${isDone ? ", finished" : ""}${selected ? ", selected" : ""}`} aria-current={selected ? "date" : undefined}>
                    <span className={`h-1 w-1 rounded-full ${selected ? "bg-zinc-200" : "bg-transparent"}`} />
                    <span className={`text-sm ${selected ? "font-bold text-zinc-100" : "text-zinc-500"}`}>{LETTERS[i]}</span>
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full ${isDone ? "bg-zinc-100 text-zinc-900" : d === today ? "border-2 border-dashed border-zinc-300" : "border-2 border-zinc-700"}`}>
                      {isDone && (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m5 12.5 4.5 4.5L19 7.5" />
                        </svg>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <div className="ml-3 flex items-center border-l border-zinc-800 pl-3" aria-label={`Logging streak: ${streak} day${streak === 1 ? "" : "s"}`}>
            <span className="relative flex h-11 w-9 items-end justify-center">
              <svg viewBox="0 0 24 32" width="36" height="44" className="absolute inset-0 text-orange-400" fill="currentColor" aria-hidden="true">
                <path d="M12 1c1 5 7 8 7 16a7 7 0 0 1-14 0c0-3 1.5-5 3-6.5C8.5 12 10 12 10 9c0-3 1-5 2-8Z" />
              </svg>
              <span className="relative mb-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-950 px-1 text-xs font-bold text-zinc-100">{streak}</span>
            </span>
          </div>
        </div>
      </section>

      {needsWeight && (
        <Link href="/nutrition#coach" className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-indigo-900/70 to-purple-900/60 px-4 py-4">
          <span>
            <span className="block font-semibold">{day === today ? "Weigh in today" : `Weigh in for ${formatDay(day)}`}</span>
            <span className="block text-sm text-zinc-300">Track your progress, judgment-free.</span>
          </span>
          <span aria-hidden className="text-2xl text-zinc-300">
            &rsaquo;
          </span>
        </Link>
      )}

      <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5" aria-label="Calories">
        <p className="text-lg font-semibold">Calories</p>
        <div className="mt-2 flex items-baseline justify-between">
          <p>
            <span className="text-3xl font-bold tabular-nums">{Math.round(totals.calories).toLocaleString("en-US")}</span> <span className="font-semibold">cal</span>
            <span className="text-zinc-500"> / {targets.calories ? Math.round(targets.calories).toLocaleString("en-US") : "no target"}</span>
          </p>
          {left !== null && (
            <p className={left < 0 ? "text-amber-300" : ""}>
              <span className="text-2xl font-bold tabular-nums">{Math.abs(left).toLocaleString("en-US")}</span> <span className="text-zinc-400">{left < 0 ? "over" : "left"}</span>
            </p>
          )}
        </div>
        <div className="mt-3">
          <Bar value={totals.calories} target={targets.calories} color="bg-emerald-400" label="Calories eaten" />
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5" aria-label="Macros">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Carbs", v: totals.carbs, t: targets.carbs, color: "bg-sky-400" },
            { label: "Fat", v: totals.fat, t: targets.fat, color: "bg-amber-400" },
            { label: "Protein", v: totals.protein, t: targets.protein, color: "bg-emerald-400" },
          ].map((m) => (
            <div key={m.label}>
              <p className="font-semibold">{m.label}</p>
              <p className="mt-1 whitespace-nowrap">
                <span className="text-xl font-bold tabular-nums">{Math.round(m.v)}</span> <span className="font-semibold">g</span>
                <span className="text-sm text-zinc-500"> / {m.t ? Math.round(m.t) : "--"}</span>
              </p>
              <div className="mt-2">
                <Bar value={m.v} target={m.t} color={m.color} label={`${m.label} eaten`} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-7 flex items-baseline justify-between">
        <h2 className="text-2xl font-semibold">Meals</h2>
        <Link href={`/nutrition/log${day === today ? "" : `?d=${day}`}`} className="font-semibold text-emerald-400">
          View diary
        </Link>
      </div>

      <div className="mt-3 space-y-3">
        {DIARY_MEALS.map((m) => {
          const items = meals[m.key] ?? [];
          const cal = items.reduce((a, i) => a + i.calories, 0);
          const prev = yesterday[m.key] ?? [];
          return (
            <section key={m.key} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3" aria-label={m.label}>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400">
                  <Icon name={m.key} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold">{m.label}</p>
                  {items.length > 0 && <p className="text-xs tabular-nums text-zinc-500">{Math.round(cal)} cal</p>}
                </div>
                <Link href={logHref(m.key)} className="rounded-full bg-emerald-500/15 px-5 py-2 font-semibold text-emerald-300 active:bg-emerald-500/25">
                  Log
                </Link>
              </div>
              {items.length > 0 ? (
                <ul className="mt-2 divide-y divide-zinc-800 border-t border-zinc-800 text-sm">
                  {items.map((it, i) => (
                    <li key={i} className="flex justify-between gap-3 py-2">
                      <span className="min-w-0 truncate text-zinc-200">{it.name}</span>
                      <span className="shrink-0 tabular-nums text-zinc-500">{Math.round(it.calories)}</span>
                    </li>
                  ))}
                </ul>
              ) : prev.length > 0 ? (
                <form action={logYesterdayMeal} className="mt-2 border-t border-zinc-800 pt-2">
                  <input type="hidden" name="day" value={day} />
                  <input type="hidden" name="meal" value={m.key} />
                  <button type="submit" className="block w-full text-left active:opacity-70">
                    <span className="block text-sm font-semibold">Log yesterday&apos;s {m.label.toLowerCase()} again</span>
                    <span className="block truncate text-sm text-zinc-500">{mealSummary(prev)}</span>
                  </button>
                </form>
              ) : null}
            </section>
          );
        })}
        {(meals.other ?? []).length > 0 && (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3" aria-label="Quick add, whole day">
            <div className="flex items-center gap-3">
              <span className="text-zinc-400">
                <Icon name="other" />
              </span>
              <p className="flex-1 text-lg font-semibold">Quick add: whole day</p>
              <p className="text-sm tabular-nums text-zinc-500">{Math.round((meals.other ?? []).reduce((a, i) => a + i.calories, 0))} cal</p>
            </div>
          </section>
        )}
      </div>

      <Link
        href={logHref()}
        aria-label="Add food"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 shadow-lg shadow-black/50 active:bg-emerald-400"
      >
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>
    </>
  );
}

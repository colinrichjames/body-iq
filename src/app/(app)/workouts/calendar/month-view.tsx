"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { formatDay } from "@/lib/dates";
import { SPORT_DOT } from "@/lib/sport";
import { useDragMove } from "@/components/use-drag-move";
import { card } from "@/components/ui";
import { rescheduleWorkout } from "../actions";

export type CalWorkout = { id: string; date: string; title: string; sport: string; status: string; minutes: number | null };

export function MonthView({
  ym,
  today,
  sel,
  cells,
  workouts,
  raceDays,
}: {
  ym: string;
  today: string;
  sel: string | null;
  cells: string[];
  workouts: CalWorkout[];
  raceDays: Record<string, string>;
}) {
  const [items, setItems] = useState(workouts);
  const [error, setError] = useState<string | null>(null);

  const move = useCallback(async (id: string, day: string) => {
    setError(null);
    let prev: string | null = null;
    setItems((cur) => cur.map((w) => (w.id === id ? ((prev = w.date), { ...w, date: day }) : w)));
    const res = await rescheduleWorkout(id, day);
    if (res.error) {
      setError(res.error);
      setItems((cur) => cur.map((w) => (w.id === id && prev ? { ...w, date: prev } : w)));
    }
  }, []);
  const { grip, over, dragging, ghost } = useDragMove(move);

  const byDay = new Map<string, CalWorkout[]>();
  for (const w of items) byDay.set(w.date, [...(byDay.get(w.date) ?? []), w]);
  const selected = sel ? (byDay.get(sel) ?? []) : [];

  return (
    <>
      {error && <p className="mt-3 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-zinc-500">
        {["M", "T", "W", "T", "F", "S", "S"].map((x, i) => (
          <span key={i}>{x}</span>
        ))}
        {cells.map((c) => {
          const ws = byDay.get(c) ?? [];
          const out = !c.startsWith(ym);
          return (
            <Link
              key={c}
              data-day={c}
              href={`/workouts/calendar?m=${ym}&d=${c}`}
              className={`flex min-h-14 flex-col items-center rounded-lg border px-0.5 py-1 ${over === c ? "border-emerald-400 bg-emerald-500/20" : c === sel ? "border-emerald-500" : c === today ? "border-zinc-600" : "border-zinc-900"} ${out ? "opacity-35" : ""}`}
            >
              <span className={`text-xs ${c === today ? "font-semibold text-emerald-400" : "text-zinc-300"}`}>{Number(c.slice(8))}</span>
              <span className="mt-1 flex flex-wrap justify-center gap-0.5">
                {ws.slice(0, 4).map((w) => (
                  <span
                    key={w.id}
                    className={`h-2 w-2 rounded-full ${SPORT_DOT[w.sport] ?? "bg-zinc-500"} ${w.status === "completed" ? "" : w.status === "skipped" ? "opacity-20" : "opacity-50 ring-1 ring-zinc-500"}`}
                  />
                ))}
              </span>
              {raceDays[c] && <span className="mt-0.5 text-[10px] leading-none text-amber-400">race</span>}
            </Link>
          );
        })}
      </div>

      {sel && (
        <section className={`${card} mt-5`}>
          <h2 className="text-sm text-zinc-400">{formatDay(sel, { weekday: true })}</h2>
          {raceDays[sel] && <p className="mt-1 text-sm text-amber-400">Race day: {raceDays[sel]}</p>}
          {selected.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Nothing planned.</p>
          ) : (
            <>
              <ul className="mt-2 divide-y divide-zinc-800">
                {selected.map((w) => (
                  <li key={w.id} className={`flex items-center gap-2 ${dragging === w.id ? "opacity-40" : ""}`}>
                    <span {...grip(w.id, w.title, sel)} aria-label={`Drag ${w.title}`} className="flex h-9 w-9 shrink-0 cursor-grab select-none items-center justify-center text-zinc-500">
                      ⠿
                    </span>
                    <Link href={`/workouts/${w.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${SPORT_DOT[w.sport] ?? "bg-zinc-500"}`} />
                        <span className="truncate">{w.title}</span>
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">{w.status === "planned" ? (w.minutes ? `${w.minutes} min` : "planned") : w.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-zinc-600">Drag the handle onto a day in the calendar to move it.</p>
            </>
          )}
          <Link href={`/workouts/new?date=${sel}`} className="mt-3 inline-block text-sm text-emerald-400">
            Add a workout on this day
          </Link>
        </section>
      )}
      {ghost}
    </>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { useCallback, useState } from "react";
import { formatDay } from "@/lib/dates";
import { SPORT_NAME } from "@/lib/sport";
import { useDragMove } from "@/components/use-drag-move";
import { StatusBadge } from "@/components/status-badge";
import { MoveControl } from "@/components/move-control";
import { rescheduleWorkout } from "./actions";

export type BoardWorkout = { id: string; date: string; title: string; sport: string; status: string; minutes: number | null };

/** Week list with drag-and-drop: grab the handle on a session and drop it on another day. */
export function WeekBoard({ days, today, workouts }: { days: string[]; today: string; workouts: BoardWorkout[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState(workouts);
  // When the server sends fresh data (after a save, delete or refresh), show it instead of the old local copy.
  const [seen, setSeen] = useState(workouts);
  if (workouts !== seen) {
    setSeen(workouts);
    setItems(workouts);
  }
  const [error, setError] = useState<string | null>(null);

  const move = useCallback(async (id: string, day: string) => {
    const moving = items.find((w) => w.id === id);
    if (moving?.status === "completed" && !window.confirm(`Move this completed workout to ${formatDay(day, { weekday: true })}? This changes your history.`)) return;
    setError(null);
    let prev: string | null = null;
    setItems((cur) => cur.map((w) => (w.id === id ? ((prev = w.date), { ...w, date: day }) : w)));
    const res = await rescheduleWorkout(id, day);
    if (res.error) {
      setError(res.error);
      toast(res.error, "error");
      setItems((cur) => cur.map((w) => (w.id === id && prev ? { ...w, date: prev } : w)));
    } else {
      toast(`Moved to ${formatDay(day, { weekday: true })}.`);
      router.refresh();
    }
  }, [items, router, toast]);
  const { grip, over, dragging, ghost } = useDragMove(move);

  return (
    <div className="mt-4 space-y-4">
      {error && <p className="rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}
      <p className="text-xs text-zinc-600">Drag a session by its handle, or press Move, to put it on another day.</p>
      {days.map((day) => {
        const list = items.filter((w) => w.date === day);
        const isToday = day === today;
        return (
          <section key={day} data-day={day} className={`rounded-xl p-1 transition-colors ${over === day ? "bg-emerald-500/10 ring-1 ring-emerald-500" : ""}`}>
            <h2 className={`text-xs font-medium uppercase tracking-wider ${isToday ? "text-emerald-400" : "text-zinc-500"}`}>
              {formatDay(day)}
              {isToday && " · today"}
            </h2>
            {list.length === 0 ? (
              <p className="mt-1 text-sm text-zinc-600">{over === day ? "Drop here" : "Rest"}</p>
            ) : (
              <ul className="mt-1 space-y-2">
                {list.map((w) => (
                  <li key={w.id} className={`flex flex-wrap items-stretch gap-1 ${dragging === w.id ? "opacity-40" : ""}`}>
                    <span
                      {...grip(w.id, w.title, day)}
                      aria-label={`Drag ${w.title}`}
                      className="flex w-9 shrink-0 cursor-grab select-none items-center justify-center rounded-xl border border-zinc-800 text-zinc-500 active:cursor-grabbing"
                    >
                      ⠿
                    </span>
                    <Link
                      href={`/workouts/${w.id}`}
                      className={`flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border px-4 py-3 active:bg-zinc-800 ${w.status === "skipped" ? "border-rose-500/30 bg-rose-500/5" : "border-zinc-800 bg-zinc-900/40"}`}
                    >
                      <div className="min-w-0">
                        <p className={`truncate font-medium ${w.status === "skipped" ? "text-zinc-500 line-through" : ""}`}>{w.title}</p>
                        <p className="text-xs text-zinc-500">
                          {SPORT_NAME[w.sport] ?? w.sport}
                          {w.minutes ? ` · ${w.minutes} min` : ""}
                        </p>
                      </div>
                      <StatusBadge status={w.status} overdue={day < today} />
                    </Link>
                    <MoveControl title={w.title} current={w.date} onMove={(d) => void move(w.id, d)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {ghost}
    </div>
  );
}

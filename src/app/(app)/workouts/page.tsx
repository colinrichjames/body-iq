import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { addDays, formatDay, isIsoDate, startOfWeek } from "@/lib/dates";
import { getToday } from "@/lib/today";
import { weekSummary } from "@/lib/week";
import type { Workout } from "@/lib/types";
import { btnPrimary } from "@/components/ui";

const SPORT_LABEL: Record<string, string> = {
  strength: "Strength",
  run: "Run",
  bike: "Bike",
  swim: "Swim",
  hyrox: "Hyrox",
  mobility: "Mobility",
  other: "Other",
};

export default async function WorkoutsPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const { supabase } = await requireUser();
  const today = await getToday();
  const anchor = d && isIsoDate(d) ? d : today;
  const weekStart = startOfWeek(anchor);
  const weekEnd = addDays(weekStart, 6);

  const { data } = await supabase
    .from("workouts")
    .select("*")
    .gte("workout_date", weekStart)
    .lte("workout_date", weekEnd)
    .order("workout_date")
    .order("created_at")
    .returns<Workout[]>();
  const workouts = data ?? [];
  const summary = weekSummary(workouts);
  const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Training</h1>
        <Link href="/workouts/new" className={`${btnPrimary} px-3 py-2 text-sm`}>
          Add workout
        </Link>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <Link href={`/workouts?d=${addDays(weekStart, -7)}`} className="px-2 py-1 text-zinc-400">
          &larr; Prev
        </Link>
        <Link href="/workouts" className="text-zinc-300">
          {formatDay(weekStart, { weekday: false })} - {formatDay(weekEnd, { weekday: false })}
        </Link>
        <Link href={`/workouts?d=${addDays(weekStart, 7)}`} className="px-2 py-1 text-zinc-400">
          Next &rarr;
        </Link>
      </div>

      {summary.plannedMin > 0 && (
        <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm text-zinc-400">Week volume</h2>
            <p className="text-sm tabular-nums">
              <span className="font-semibold text-emerald-400">{summary.compliance}%</span>{" "}
              <span className="text-zinc-500">
                {hm(summary.doneMin)} of {hm(summary.plannedMin)}
              </span>
            </p>
          </div>
          <ul className="mt-3 space-y-2">
            {summary.bySport.map((t) => (
              <li key={t.sport} className="text-sm">
                <div className="flex justify-between">
                  <span>{SPORT_LABEL[t.sport]}</span>
                  <span className="tabular-nums text-zinc-400">
                    {hm(t.doneMin)} / {hm(t.plannedMin)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, t.plannedMin ? (t.doneMin / t.plannedMin) * 100 : 0)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-4 space-y-4">
        {days.map((day) => {
          const list = workouts.filter((w) => w.workout_date === day);
          const isToday = day === today;
          return (
            <section key={day}>
              <h2 className={`text-xs font-medium uppercase tracking-wider ${isToday ? "text-emerald-400" : "text-zinc-500"}`}>
                {formatDay(day)}
                {isToday && " · today"}
              </h2>
              {list.length === 0 ? (
                <p className="mt-1 text-sm text-zinc-600">Rest</p>
              ) : (
                <ul className="mt-1 space-y-2">
                  {list.map((w) => (
                    <li key={w.id}>
                      <Link
                        href={`/workouts/${w.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 active:bg-zinc-800"
                      >
                        <div className="min-w-0">
                          <p className={`truncate font-medium ${w.status === "skipped" ? "text-zinc-500 line-through" : ""}`}>{w.title}</p>
                          <p className="text-xs text-zinc-500">
                            {SPORT_LABEL[w.sport]}
                            {w.planned_duration_min ? ` · ${w.planned_duration_min} min` : ""}
                          </p>
                        </div>
                        <StatusDot status={w.status} overdue={w.status === "planned" && day < today} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}

function StatusDot({ status, overdue }: { status: string; overdue: boolean }) {
  if (status === "completed") return <span className="text-sm text-emerald-400">Done</span>;
  if (status === "skipped") return <span className="text-sm text-zinc-500">Skipped</span>;
  if (overdue) return <span className="text-sm text-amber-400">Missed</span>;
  return <span className="text-sm text-zinc-500">Planned</span>;
}

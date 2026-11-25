import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { addDays, formatDay, isIsoDate, weekdayIndex } from "@/lib/dates";
import { getToday } from "@/lib/today";
import { SPORT_DOT, SPORT_NAME } from "@/lib/sport";
import { btnPrimary, card } from "@/components/ui";
import type { Race, Workout } from "@/lib/types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string }> }) {
  const { m, d } = await searchParams;
  const { supabase } = await requireUser();
  const today = await getToday();
  const sel = d && isIsoDate(d) ? d : null;
  const ym = m && /^\d{4}-\d{2}$/.test(m) ? m : (sel ?? today).slice(0, 7);
  const first = `${ym}-01`;
  const next = shiftMonth(ym, 1);
  const gridStart = addDays(first, -weekdayIndex(first));
  const last = addDays(`${next}-01`, -1);
  const gridEnd = addDays(last, 6 - weekdayIndex(last));
  const cells: string[] = [];
  for (let c = gridStart; c <= gridEnd; c = addDays(c, 1)) cells.push(c);

  const [wRes, rRes] = await Promise.all([
    supabase.from("workouts").select("*").gte("workout_date", gridStart).lte("workout_date", gridEnd).order("workout_date").order("created_at").returns<Workout[]>(),
    supabase.from("races").select("*").gte("race_date", gridStart).lte("race_date", gridEnd).returns<Race[]>(),
  ]);
  const byDay = new Map<string, Workout[]>();
  for (const w of wRes.data ?? []) byDay.set(w.workout_date, [...(byDay.get(w.workout_date) ?? []), w]);
  const raceDays = new Map((rRes.data ?? []).map((r) => [r.race_date, r.name]));

  const inMonth = (wRes.data ?? []).filter((w) => w.workout_date.startsWith(ym));
  const done = inMonth.filter((w) => w.status === "completed").length;
  const mins = inMonth.filter((w) => w.status === "completed").reduce((a, w) => a + (w.actual_duration_min ?? w.planned_duration_min ?? 0), 0);
  const selected = sel ? (byDay.get(sel) ?? []) : [];
  const [yy, mm] = ym.split("-").map(Number);

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <Link href="/workouts/new" className={`${btnPrimary} px-3 py-2 text-sm`}>
          Add
        </Link>
      </div>
      <div className="mt-1 flex gap-4 text-sm">
        <Link href="/workouts" className="text-zinc-400">
          Week view
        </Link>
        <span className="text-emerald-400">Month view</span>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <Link href={`/workouts/calendar?m=${shiftMonth(ym, -1)}`} className="px-2 py-1 text-zinc-400">
          &larr;
        </Link>
        <Link href="/workouts/calendar" className="font-medium text-zinc-200">
          {MONTHS[mm - 1]} {yy}
        </Link>
        <Link href={`/workouts/calendar?m=${shiftMonth(ym, 1)}`} className="px-2 py-1 text-zinc-400">
          &rarr;
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-zinc-500">
        {["M", "T", "W", "T", "F", "S", "S"].map((x, i) => (
          <span key={i}>{x}</span>
        ))}
        {cells.map((c) => {
          const ws = byDay.get(c) ?? [];
          const out = !c.startsWith(ym);
          const isSel = c === sel;
          return (
            <Link
              key={c}
              href={`/workouts/calendar?m=${ym}&d=${c}`}
              className={`flex min-h-14 flex-col items-center rounded-lg border px-0.5 py-1 ${isSel ? "border-emerald-500" : c === today ? "border-zinc-600" : "border-zinc-900"} ${out ? "opacity-35" : ""}`}
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
              {raceDays.has(c) && <span className="mt-0.5 text-[10px] leading-none text-amber-400">race</span>}
            </Link>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        Filled dot = done, outlined = planned, faded = skipped. {done} done this month{mins ? `, ${Math.round(mins / 6) / 10} h` : ""}.
      </p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400">
        {Object.keys(SPORT_DOT).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${SPORT_DOT[s]}`} />
            {SPORT_NAME[s]}
          </span>
        ))}
      </div>

      {sel && (
        <section className={`${card} mt-5`}>
          <h2 className="text-sm text-zinc-400">{formatDay(sel, { weekday: true })}</h2>
          {raceDays.has(sel) && <p className="mt-1 text-sm text-amber-400">Race day: {raceDays.get(sel)}</p>}
          {selected.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Nothing planned.</p>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-800">
              {selected.map((w) => (
                <li key={w.id}>
                  <Link href={`/workouts/${w.id}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${SPORT_DOT[w.sport] ?? "bg-zinc-500"}`} />
                      {w.title}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {w.status === "planned" ? `${w.planned_duration_min ?? ""}${w.planned_duration_min ? " min" : "planned"}` : w.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/workouts/new?date=${sel}`} className="mt-3 inline-block text-sm text-emerald-400">
            Add a workout on this day
          </Link>
        </section>
      )}
    </main>
  );
}

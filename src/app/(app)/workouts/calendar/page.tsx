import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { addDays, isIsoDate, startOfSundayWeek } from "@/lib/dates";
import { getToday } from "@/lib/today";
import { SPORT_DOT, SPORT_NAME } from "@/lib/sport";
import { btnPrimary } from "@/components/ui";
import { MonthView } from "./month-view";
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
  const gridStart = startOfSundayWeek(first);
  const last = addDays(`${next}-01`, -1);
  const gridEnd = addDays(startOfSundayWeek(last), 6);
  const cells: string[] = [];
  for (let c = gridStart; c <= gridEnd; c = addDays(c, 1)) cells.push(c);

  const [wRes, rRes] = await Promise.all([
    supabase.from("workouts").select("*").gte("workout_date", gridStart).lte("workout_date", gridEnd).order("workout_date").order("created_at").returns<Workout[]>(),
    supabase.from("races").select("*").gte("race_date", gridStart).lte("race_date", gridEnd).returns<Race[]>(),
  ]);
  // Names of the races behind race-plan sessions, so the day view can say which sessions came from a plan.
  const planIds = [...new Set((wRes.data ?? []).map((w) => w.race_id).filter((x): x is string => !!x))];
  const planRaces = planIds.length ? ((await supabase.from("races").select("id,name").in("id", planIds)).data ?? []) : [];
  const planName = new Map<string, string>(planRaces.map((r: { id: string; name: string }) => [r.id, r.name]));
  const raceDays = new Map((rRes.data ?? []).map((r) => [r.race_date, r.name]));

  const inMonth = (wRes.data ?? []).filter((w) => w.workout_date.startsWith(ym));
  const done = inMonth.filter((w) => w.status === "completed").length;
  const mins = inMonth.filter((w) => w.status === "completed").reduce((a, w) => a + (w.actual_duration_min ?? w.planned_duration_min ?? 0), 0);
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

      <MonthView
        key={(wRes.data ?? []).map((w) => `${w.id}${w.workout_date}${w.status}`).join() + (sel ?? "")}
        ym={ym}
        today={today}
        sel={sel}
        cells={cells}
        workouts={(wRes.data ?? []).map((w) => ({ id: w.id, date: w.workout_date, title: w.title, sport: w.sport, status: w.status, minutes: w.planned_duration_min, plan: w.race_id ? (planName.get(w.race_id) ?? "Race plan") : null }))}
        raceDays={Object.fromEntries(raceDays)}
      />

      <p className="mt-3 text-xs text-zinc-500">
        Filled dot = done, amber ring = in progress, outlined = planned, faded = skipped. {done} done this month{mins ? `, ${Math.round(mins / 6) / 10} h` : ""}.
      </p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400">
        {Object.keys(SPORT_DOT).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${SPORT_DOT[s]}`} />
            {SPORT_NAME[s]}
          </span>
        ))}
      </div>

    </main>
  );
}

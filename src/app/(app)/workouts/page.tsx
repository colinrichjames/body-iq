import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { addDays, formatDay, isIsoDate, startOfWeek } from "@/lib/dates";
import { getToday } from "@/lib/today";
import { computeLoad } from "@/lib/load";
import { HARD_DAY_RPE } from "@/lib/intensity";
import { stackingWarnings } from "@/lib/stacking";
import { weekSummary } from "@/lib/week";
import { realignPlan } from "../races/actions";
import { adaptMissed } from "./actions";
import { adherence, planMissed, streaks } from "@/lib/adherence";
import type { Workout } from "@/lib/types";
import { btnPrimary } from "@/components/ui";
import { WeekBoard } from "./week-board";

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

  const from = [addDays(weekStart, -1), addDays(today, -89)].sort()[0];
  const { data } = await supabase
    .from("workouts")
    .select("*")
    .gte("workout_date", from)
    .lte("workout_date", [addDays(weekEnd, 1), addDays(today, 7)].sort().at(-1)!)
    .order("workout_date")
    .order("created_at")
    .returns<Workout[]>();
  const history = data ?? [];
  const workouts = history.filter((w) => w.workout_date >= weekStart && w.workout_date <= weekEnd);
  const load = computeLoad(history, today, weekStart, workouts);
  const warnings = stackingWarnings(history.filter((w) => w.workout_date >= addDays(weekStart, -1) && w.workout_date <= addDays(weekEnd, 1))).filter(
    (x) => x.date >= weekStart && x.date <= weekEnd,
  );
  const missedByRace = new Map<string, number>();
  for (const w of history) {
    if (w.status === "planned" && w.race_id && w.workout_date < today && w.workout_date >= addDays(today, -13)) {
      missedByRace.set(w.race_id, (missedByRace.get(w.race_id) ?? 0) + 1);
    }
  }
  const realign = [...missedByRace.entries()].find(([, n]) => n >= 3) ?? null;
  const { data: raceRows } = await supabase.from("races").select("id,race_date");
  const raceDates = Object.fromEntries((raceRows ?? []).map((r) => [r.id as string, r.race_date as string]));
  const missedPlan = planMissed(history, today, raceDates);
  const adh7 = adherence(history, today, 7);
  const adh28 = adherence(history, today, 28);
  const streak = streaks(history, today);
  const summary = weekSummary(workouts);
  const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Training</h1>
        <Link href="/workouts/calendar" className="ml-auto mr-3 text-sm text-zinc-400">
          Month
        </Link>
        <Link href="/workouts/history" className="mr-3 text-sm text-zinc-400">
          History
        </Link>
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


      {missedPlan.missed.length > 0 && (
        <section className="mt-4 rounded-2xl border border-amber-900 bg-amber-950/30 p-4 text-sm">
          <p className="font-medium text-amber-300">
            {missedPlan.missed.length === 1 ? "You missed a planned session." : `You missed ${missedPlan.missed.length} planned sessions in the last two weeks.`}
          </p>
          <p className="mt-1 text-zinc-400">Don&apos;t cram them in. Body IQ keeps the important recent ones and drops the rest.</p>
          <ul className="mt-3 space-y-1 text-zinc-300">
            {missedPlan.moves.map((m) => (
              <li key={m.id}>
                <span className="text-emerald-400">Move</span> {m.title} ({formatDay(m.from, { weekday: true })}) to {formatDay(m.to, { weekday: true })}
              </li>
            ))}
            {missedPlan.skips.map((x) => (
              <li key={x.id} className="text-zinc-500">
                Skip {x.title} ({formatDay(x.workout_date, { weekday: true })})
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={adaptMissed}>
              <input type="hidden" name="mode" value="adapt" />
              <button type="submit" className="rounded-xl bg-amber-400 px-3 py-2 font-medium text-zinc-950 active:bg-amber-300">
                {missedPlan.moves.length ? "Apply this" : "Skip missed sessions"}
              </button>
            </form>
            {missedPlan.moves.length > 0 && (
              <form action={adaptMissed}>
                <input type="hidden" name="mode" value="skip" />
                <button type="submit" className="rounded-xl border border-zinc-700 px-3 py-2 text-zinc-200 active:bg-zinc-800">
                  Skip them all
                </button>
              </form>
            )}
            {realign && (
              <form action={realignPlan}>
                <input type="hidden" name="id" value={realign[0]} />
                <input type="hidden" name="mode" value="rebuild" />
                <button type="submit" className="rounded-xl border border-zinc-700 px-3 py-2 text-zinc-200 active:bg-zinc-800">
                  Rebuild to race date
                </button>
              </form>
            )}
          </div>
          {realign && <p className="mt-2 text-xs text-zinc-500">Rebuilding keeps everything you completed and re-plans back from race day.</p>}
        </section>
      )}

      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm text-zinc-400">Consistency</h2>
        {adh28.due === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Finish or pass the date of a few planned sessions to see how consistent you are.</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3 tabular-nums">
              <div>
                <p className="text-xs text-zinc-500">Last 7 days</p>
                <p className="text-xl font-semibold">{adh7.pct === null ? "--" : `${adh7.pct}%`}</p>
                <p className="text-xs text-zinc-500">{adh7.due ? `${adh7.done} of ${adh7.due} sessions` : "nothing due yet"}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Last 28 days</p>
                <p className="text-xl font-semibold">{adh28.pct}%</p>
                <p className="text-xs text-zinc-500">{adh28.done} of {adh28.due} sessions</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Session streak</p>
                <p className="text-xl font-semibold">{streak.sessions}</p>
                <p className="text-xs text-zinc-500">in a row completed</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Week streak</p>
                <p className="text-xl font-semibold">{streak.weeks}</p>
                <p className="text-xs text-zinc-500">weeks at 80%+ (best {streak.bestWeeks})</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-zinc-500">Counts sessions that are done, skipped, or past their date. Upcoming and today&apos;s unfinished sessions don&apos;t count yet.</p>
          </>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm text-zinc-400">Training load</h2>
        {load.status === "insufficient" ? (
          <p className="mt-2 text-sm text-zinc-500">Log a few more completed sessions (with RPE) to see fitness and fatigue. It needs about two weeks of history.</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-3 gap-3 tabular-nums">
              <div>
                <p className="text-xs text-zinc-500">Fitness</p>
                <p className="text-xl font-semibold">{load.ctl}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Fatigue</p>
                <p className="text-xl font-semibold">{load.atl}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Form</p>
                <p className={`text-xl font-semibold ${load.tsb < -15 ? "text-amber-400" : load.tsb > 10 ? "text-emerald-400" : ""}`}>{load.tsb > 0 ? "+" : ""}{load.tsb}</p>
              </div>
            </div>
            <p className="mt-2 text-sm text-zinc-300">
              {load.status === "fatigued" && "Fatigue is well above fitness. Keep the next hard day honest, or take it easy."}
              {load.status === "building" && "Fatigue is running ahead of fitness. Normal in a build; watch recovery."}
              {load.status === "fresh" && "You're fresh. Good window for a quality session or a race."}
              {load.status === "steady" && "Fitness and fatigue are in balance."}
            </p>
          </>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-zinc-500">Actual load this week</p>
            <p className="text-xl font-semibold tabular-nums">{load.weekActualLoad}</p>
            <p className="text-xs text-zinc-500">completed sessions, RPE x minutes</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Planned load (estimate)</p>
            <p className="text-xl font-semibold tabular-nums text-zinc-400">~{load.weekPlannedLoad}</p>
            <p className="text-xs text-zinc-500">assumes RPE by session type: easy 3, moderate 5, hard 7.5</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Hard days this week: {load.weekHardDays} logged (hard day = RPE {HARD_DAY_RPE} or higher)
          {load.weekHardPlanned > 0 ? `, ${load.weekHardPlanned} hard session${load.weekHardPlanned === 1 ? "" : "s"} still planned` : ""}. Load is a simple estimate, not TrainingPeaks TSS.
        </p>
      </section>

      {warnings.map((w, i) => (
        <p key={i} className="mt-3 rounded-xl border border-amber-900 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
          {w.message}
        </p>
      ))}

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

      <WeekBoard
        key={workouts.map((w) => `${w.id}${w.workout_date}${w.status}`).join()}
        days={days}
        today={today}
        workouts={workouts.map((w) => ({ id: w.id, date: w.workout_date, title: w.title, sport: w.sport, status: w.status, minutes: w.planned_duration_min }))}
      />
    </main>
  );
}

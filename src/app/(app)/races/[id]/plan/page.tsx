import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { diffDays, formatDay } from "@/lib/dates";
import { planWeeks, raceLabel, type OtherRace, type Phase } from "@/lib/plan";
import { defaultPrefs, PREF_DAYS, sanitizePrefs } from "@/lib/plan-prefs";
import { hoursText, phaseCounts, weekRows, type Session } from "@/lib/plan-view";
import { PHASE_INFO, planStartFrom } from "@/lib/race-phase";
import { getToday } from "@/lib/today";
import { SubmitButton } from "@/components/submit-button";
import { btnPrimary, card, field } from "@/components/ui";
import type { Race } from "@/lib/types";
import { regeneratePlan, savePlanPrefs } from "../../actions";

const PHASE_BG: Record<Phase, string> = { base: "bg-sky-500", build: "bg-emerald-500", peak: "bg-amber-400", taper: "bg-violet-400" };
const PHASE_TEXT: Record<Phase, string> = { base: "text-sky-300", build: "text-emerald-300", peak: "text-amber-300", taper: "text-violet-300" };

type Row = { id: string; workout_date: string; title: string; sport: string; planned_duration_min: number | null; status: string; created_at: string };

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await requireUser();
  const today = await getToday();
  const { data: race } = await supabase.from("races").select("*").eq("id", id).maybeSingle<Race>();
  if (!race) notFound();

  const [{ data: rows }, { data: prof }, { data: otherRows }] = await Promise.all([
    supabase.from("workouts").select("id,workout_date,title,sport,planned_duration_min,status,created_at").eq("race_id", id).eq("generated", true).order("workout_date").returns<Row[]>(),
    supabase.from("profiles").select("training_prefs").eq("id", userId).maybeSingle<{ training_prefs: unknown }>(),
    supabase.from("races").select("name,race_date,priority").neq("id", id).returns<{ name: string; race_date: string; priority: "A" | "B" | "C" }[]>(),
  ]);
  const planStart = planStartFrom(rows ?? []);
  const prefs = sanitizePrefs(prof?.training_prefs) ?? defaultPrefs(race.race_type);
  const others: OtherRace[] = (otherRows ?? []).map((o) => ({ name: o.name, date: o.race_date, priority: o.priority }));
  const past = diffDays(today, race.race_date) < 0;

  const weeks = planStart ? planWeeks(race.race_type, planStart, race.race_date, race.priority !== "A" ? 1 : undefined, others) : [];
  const sessions: Session[] = (rows ?? []).map((r) => ({ id: r.id, date: r.workout_date, title: r.title, sport: r.sport, minutes: r.planned_duration_min, status: r.status }));
  const table = weekRows(weeks, sessions, others.filter((o) => o.date !== race.race_date));
  const counts = phaseCounts(weeks);
  const currentIdx = table.findIndex((w) => w.weekStart <= today && today <= w.weekEnd);
  const maxMin = Math.max(1, ...table.map((w) => w.minutes));

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href={`/races/${race.id}`} className="text-sm text-zinc-400">
        &larr; {race.name}
      </Link>
      <p className="mt-3 text-xs uppercase tracking-wider text-zinc-500">
        {raceLabel(race.race_type)} &middot; {race.priority} race &middot; {formatDay(race.race_date, { weekday: true, year: true })}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Training plan</h1>

      {weeks.length > 0 ? (
        <>
          <p className="mt-1 text-sm text-zinc-400">
            {weeks.length} weeks, {counts.map(([p, n]) => `${n} ${PHASE_INFO[p].label.toLowerCase()}`).join(", ")}.
          </p>

          <section className={`${card} mt-4`} aria-label="Plan timeline">
            <div className="flex gap-0.5" role="img" aria-label={`Timeline: ${counts.map(([p, n]) => `${n} weeks ${p}`).join(", ")}`}>
              {table.map((w) => (
                <div key={w.weekStart} className="relative flex-1">
                  <div className={`h-8 rounded-sm ${PHASE_BG[w.phase]} ${w.index - 1 === currentIdx ? "ring-2 ring-white" : ""} ${w.note?.startsWith("Recovery") || w.note?.startsWith("Race this") ? "opacity-60" : ""}`} />
                  {w.others.length > 0 && <span aria-hidden="true" className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px]">🏁</span>}
                </div>
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
              {(Object.keys(PHASE_BG) as Phase[]).filter((p) => counts.some(([c]) => c === p)).map((p) => (
                <li key={p} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-sm ${PHASE_BG[p]}`} />
                  {PHASE_INFO[p].label}
                </li>
              ))}
              {table.some((w) => w.others.length) && <li>🏁 Another race</li>}
            </ul>
            {currentIdx >= 0 && <p className="mt-2 text-xs text-zinc-500">You are in week {currentIdx + 1} (outlined).</p>}
          </section>

          {table.some((w) => w.note) && (
            <section className={`${card} mt-4`} aria-label="Other races">
              <h2 className="font-medium">Built around your other races</h2>
              <ul className="mt-2 space-y-1.5 text-sm text-zinc-300">
                {table.filter((w) => w.note).map((w) => (
                  <li key={w.weekStart}>
                    <span className="text-zinc-500">Week {w.index}:</span> {w.note}. Volume is lighter that week.
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-zinc-400">{past ? "This race has passed." : "No plan yet. Pick your training days below and build one."}</p>
      )}

      {!past && (
        <section className={`${card} mt-4`} aria-label="Preferences">
          <h2 className="font-medium">Your training days</h2>
          <p className="mt-1 text-sm text-zinc-400">Choose the days you can train and which day gets the long session. The plan rebuilds around them. Finished sessions and your own workouts stay put.</p>
          <form action={savePlanPrefs} className="mt-3 space-y-3">
            <input type="hidden" name="race_id" value={race.id} />
            <div className="grid grid-cols-7 gap-1">
              {PREF_DAYS.map((d) => (
                <label key={d.dow} className="block">
                  <input type="checkbox" name="day" value={d.dow} defaultChecked={prefs.days.includes(d.dow)} className="peer sr-only" />
                  <span className="block cursor-pointer rounded-lg border border-zinc-800 py-2 text-center text-xs text-zinc-400 peer-checked:border-emerald-500 peer-checked:bg-emerald-500/20 peer-checked:text-emerald-300">{d.short}</span>
                </label>
              ))}
            </div>
            <label className="block text-sm text-zinc-400">
              Long session day
              <select name="long_day" defaultValue={prefs.longDay} className={`${field} mt-1`}>
                {PREF_DAYS.map((d) => (
                  <option key={d.dow} value={d.dow}>
                    {d.long}
                  </option>
                ))}
              </select>
            </label>
            <SubmitButton className={`${btnPrimary} w-full`} pendingText="Rebuilding...">
              {weeks.length ? "Save days and rebuild plan" : "Save days and build plan"}
            </SubmitButton>
          </form>
          {weeks.length > 0 && (
            <form action={regeneratePlan} className="mt-2">
              <input type="hidden" name="id" value={race.id} />
              <SubmitButton className="w-full text-sm text-zinc-400 underline" pendingText="Rebuilding...">
                Rebuild without changing anything
              </SubmitButton>
            </form>
          )}
        </section>
      )}

      {table.length > 0 && (
        <section className="mt-6" aria-label="Weeks">
          <h2 className="text-lg font-semibold">Week by week</h2>
          <ul className="mt-2 space-y-2">
            {table.map((w) => (
              <li key={w.weekStart}>
                <details open={w.index - 1 === currentIdx || w.index - 1 === currentIdx + 1} className="rounded-2xl border border-zinc-800 bg-zinc-900/40">
                  <summary className="cursor-pointer list-none px-4 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">
                        Week {w.index} <span className={`text-sm ${PHASE_TEXT[w.phase]}`}>{w.isRaceWeek ? "Race week" : PHASE_INFO[w.phase].label}</span>
                      </span>
                      <span className="text-xs tabular-nums text-zinc-500">{w.minutes ? hoursText(w.minutes) : "rest"}</span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {formatDay(w.weekStart)} to {formatDay(w.weekEnd)}
                      {w.note ? ` · ${w.note}` : ""}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
                      <div className={`h-full ${PHASE_BG[w.phase]}`} style={{ width: `${Math.round((w.minutes / maxMin) * 100)}%` }} />
                    </div>
                  </summary>
                  <ul className="divide-y divide-zinc-800/70 border-t border-zinc-800 px-4">
                    {w.sessions.length === 0 && <li className="py-2.5 text-sm text-zinc-500">No sessions.</li>}
                    {w.sessions.map((s) => (
                      <li key={s.id}>
                        <Link href={`/workouts/${s.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                          <span className="min-w-0">
                            <span className="block text-xs text-zinc-500">{formatDay(s.date, { weekday: true })}</span>
                            <span className={`block truncate ${s.status === "completed" ? "text-zinc-500 line-through" : ""}`}>{s.title}</span>
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-zinc-500">{s.status === "completed" ? "Done" : s.minutes ? `${s.minutes} min` : ""}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

import { ConfirmButton } from "@/components/confirm-button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getToday } from "@/lib/today";
import { addDays, formatDay } from "@/lib/dates";
import type { Workout } from "@/lib/types";
import { btnGhost, btnPrimary, card } from "@/components/ui";
import { fuelCheck, sessionFuel, sessionTotals } from "@/lib/fuel";
import { looksMerged } from "@/lib/structure";
import { sessionUnits } from "@/lib/steps";
import { progressLabel } from "@/lib/progress";
import { StatusBadge } from "@/components/status-badge";
import { recap } from "@/lib/player";
import { loadDeload } from "@/lib/progression-data";
import { mergeCheckins } from "@/lib/readiness";
import { DeloadNotice } from "@/components/deload-notice";
import type { DailyHealth, RecoveryCheckin } from "@/lib/types";
import { sessionInsights, type SessionInsights } from "@/lib/session-insights";
import { prText } from "@/lib/lifting";
import { GYM_READY, isStale, isSwapped, stationsIn } from "@/lib/hyrox-swaps";
import { fmtDist, fmtPace } from "@/lib/distance";
import { buildSteps } from "@/lib/steps";
import { restSummary } from "@/lib/context";
import type { WorkoutSet } from "@/lib/types";
import { field } from "@/components/ui";
import { attachActivity, deleteWorkout, duplicateWorkout, logSessionFuel, moveWorkout, setGymSwaps, setStatus } from "../actions";
import { garminSport } from "@/lib/sport";

export default async function WorkoutPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase } = await requireUser();
  const today = await getToday();
  const { data: w } = await supabase.from("workouts").select("*").eq("id", id).maybeSingle<Workout>();
  if (!w) notFound();

  const s = w.structure;
  type Act = { id: string; sport: string | null; title: string | null; started_at: string; duration_sec: number | null; distance_m: number | null; avg_hr: number | null; training_load: number | null };
  let suggestions: Act[] = [];
  if (w.status !== "completed") {
    const { data: acts } = await supabase
      .from("activities")
      .select("id,sport,title,started_at,duration_sec,distance_m,avg_hr,training_load")
      .gte("started_at", `${addDays(w.workout_date, -1)}T00:00:00Z`)
      .lte("started_at", `${addDays(w.workout_date, 1)}T23:59:59Z`)
      .order("started_at")
      .returns<Act[]>();
    const { data: used } = await supabase.from("workouts").select("activity_id").not("activity_id", "is", null);
    const usedIds = new Set((used ?? []).map((u) => u.activity_id));
    suggestions = (acts ?? []).filter((a) => !usedIds.has(a.id) && garminSport(a.sport) === w.sport);
  }
  const unit = w.distance_unit ?? "mi";
  const pace = w.actual_distance_km && w.actual_duration_min && w.sport !== "swim" ? fmtPace(w.actual_duration_min, w.actual_distance_km, unit) : null;
  const fuel = sessionFuel(w);
  const totals = sessionTotals(w.actual_duration_min ?? w.planned_duration_min ?? 0, w.sport);
  const check = fuelCheck(w);
  const hasGuide = !!(s?.exercises?.length || s?.blocks?.length);
  const units = sessionUnits(w);
  let doneSets = 0;
  if (w.status === "in_progress") {
    const { count } = await supabase.from("workout_sets").select("id", { count: "exact", head: true }).eq("workout_id", w.id);
    doneSets = count ?? 0;
  }
  const inProgress = w.status === "in_progress";
  let loggedSets: WorkoutSet[] = [];
  if (w.status === "completed" || w.status === "in_progress") {
    const { data: ls } = await supabase.from("workout_sets").select("*").eq("workout_id", w.id).order("created_at").returns<WorkoutSet[]>();
    loggedSets = ls ?? [];
  }
  let insights: SessionInsights = { prs: [], next: [] };
  if (w.status === "completed" && loggedSets.length) {
    insights = await sessionInsights(
      supabase,
      w,
      loggedSets.map((r) => ({ exercise: r.exercise, set_number: r.set_number, reps: r.reps, weight_lb: r.weight_lb !== null ? Number(r.weight_lb) : null, rpe: r.rpe !== null ? Number(r.rpe) : null, skipped: r.skipped })),
    ).catch(() => insights);
  }
  let deloadCheck: Awaited<ReturnType<typeof loadDeload>> = { level: "none", reasons: [], exercises: [] };
  if (w.status === "planned" && w.sport === "strength") {
    const [{ data: hrows }, { data: crows }] = await Promise.all([
      supabase.from("daily_health").select("*").order("day", { ascending: false }).limit(14).returns<DailyHealth[]>(),
      supabase.from("recovery_checkins").select("day,sleep_hours,soreness,energy").order("day", { ascending: false }).limit(14).returns<RecoveryCheckin[]>(),
    ]);
    deloadCheck = await loadDeload(supabase, today, mergeCheckins(hrows ?? [], crows ?? []));
  }
  const recapRows = recap(loggedSets.map((r) => ({ exercise: r.exercise, set_number: r.set_number, reps: r.reps, weight_lb: r.weight_lb !== null ? Number(r.weight_lb) : null, rpe: r.rpe !== null ? Number(r.rpe) : null, skipped: r.skipped, note: r.note })));
  const exSteps = buildSteps(w);
  const blockRows = w.status === "completed" || w.status === "in_progress" ? (w.status === "in_progress" ? (w.progress?.blocks ?? []) : (w.block_results ?? [])) : [];

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href={`/workouts?d=${w.workout_date}`} className="text-sm text-zinc-400">
        &larr; Training
      </Link>
      <p className="mt-3 text-xs uppercase tracking-wider text-zinc-500">
        {formatDay(w.workout_date, { weekday: true, year: true })} &middot; {w.sport}
        {w.planned_duration_min ? ` · ${w.planned_duration_min} min` : ""}
        {w.planned_distance_km ? ` · ${fmtDist(w.planned_distance_km, unit)}` : ""}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{w.title}</h1>
      <div className="mt-2 flex items-center gap-2">
        <StatusBadge status={w.status} overdue={w.workout_date < today} />
        {inProgress && <span className="text-sm text-amber-300">{progressLabel(units.kind, w.progress, doneSets, units.total)}</span>}
      </div>
      {w.description && <p className="mt-3 whitespace-pre-line text-zinc-300">{w.description}</p>}

      {s?.exercises && s.exercises.length > 0 && (
        <section className={`${card} mt-5`}>
          <h2 className="text-sm text-zinc-400">
            {s.rounds ? `${s.rounds} rounds, rest ${s.rest_sec ?? 75}s between rounds` : "Exercises"}
          </h2>
          <ul className="mt-2 divide-y divide-zinc-800">
            {s.exercises.map((e, i) => (
              <li key={i} className="py-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span>{e.name}</span>
                  <span className="shrink-0 text-zinc-400">
                    {e.seconds ? `${e.sets ? `${e.sets} x ` : ""}${e.seconds}s` : `${e.sets ? `${e.sets} x ` : ""}${e.reps ?? ""}`}
                    {e.weight_lb ? ` @ ${e.weight_lb} lb` : ""}
                  </span>
                </div>
                {restSummary(exSteps, e.name) && <p className="mt-0.5 text-xs text-zinc-500">{restSummary(exSteps, e.name)}</p>}
                {looksMerged(e.name) && (
                  <p className="mt-1 text-xs text-amber-400">This looks like several exercises in one line. Tap Customize to split it before you start.</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {s?.blocks && s.blocks.length > 0 && (
        <section className={`${card} mt-5`}>
          <h2 className="text-sm text-zinc-400">Session</h2>
          <ol className="mt-2 space-y-3">
            {s.blocks.map((b, i) => (
              <li key={i} className="text-sm">
                <p className="font-medium">
                  {b.name}
                  {b.minutes ? <span className="font-normal text-zinc-500"> &middot; {b.minutes} min</span> : null}
                </p>
                <p className="text-zinc-400">{b.detail}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {recapRows.length > 0 && (
        <section className={`${card} mt-5`}>
          <h2 className="text-sm text-zinc-400">{inProgress ? "Logged so far" : "What you did"}</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {recapRows.map((r) => (
              <li key={r.exercise}>
                <p className="font-medium">{r.exercise}</p>
                {r.notes.length > 0 && <p className="text-xs text-emerald-400/80">{r.notes.join(" · ")}</p>}
                <p className="text-zinc-400">
                  {r.lines.map((l, i) => (
                    <span key={i} className={l === "skipped" ? "text-amber-400" : ""}>
                      {i > 0 ? " · " : ""}
                      {l}
                    </span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {w.sport === "hyrox" && w.status !== "completed" && stationsIn(s).length > 0 && (
        <section className={`${card} mt-5`}>
          <h2 className="text-sm text-zinc-400">{isSwapped(s) ? "Gym versions are on" : "No Hyrox equipment?"}</h2>
          <p className="mt-1 text-sm text-zinc-300">
            {isSwapped(s)
              ? "Stations that need a sled, SkiErg, wall, big floor or carry space are replaced with classic-gym versions that train the same muscles."
              : "Swap the SkiErg, sleds, wall balls, sandbag, farmers carry and burpee broad jumps for exercises from a regular gym with little floor space. You can switch back any time."}
          </p>
          <ul className="mt-3 divide-y divide-zinc-800 text-sm">
            {stationsIn(s).map((st) => (
              <li key={st.id} className="py-2">
                <p>
                  <span className="text-zinc-500 line-through">{st.hyrox}</span> <span className="font-medium text-emerald-400">{st.gym}</span>
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">{st.why}</p>
                <p className="mt-0.5 text-xs text-zinc-500">Or: {st.alts.join("; ")}.</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-600">These need no swap: {GYM_READY.join("; ")}.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {isStale(s) && (
              <form action={setGymSwaps}>
                <input type="hidden" name="id" value={w.id} />
                <input type="hidden" name="mode" value="on" />
                <input type="hidden" name="scope" value="one" />
                <button type="submit" className={`${btnPrimary} px-3 py-2 text-sm`}>
                  Update to the latest gym versions
                </button>
              </form>
            )}
            <form action={setGymSwaps}>
              <input type="hidden" name="id" value={w.id} />
              <input type="hidden" name="mode" value={isSwapped(s) ? "off" : "on"} />
              <input type="hidden" name="scope" value="one" />
              <button type="submit" className={isSwapped(s) ? `${btnGhost} px-3 py-2 text-sm` : `${btnPrimary} px-3 py-2 text-sm`}>
                {isSwapped(s) ? "Back to Hyrox stations" : "Use gym versions"}
              </button>
            </form>
            <form action={setGymSwaps}>
              <input type="hidden" name="id" value={w.id} />
              <input type="hidden" name="mode" value={isSwapped(s) ? "off" : "on"} />
              <input type="hidden" name="scope" value="upcoming" />
              <button type="submit" className={`${btnGhost} px-3 py-2 text-sm`}>
                {isSwapped(s) ? "Undo for all upcoming Hyrox" : "Do this for all upcoming Hyrox"}
              </button>
            </form>
          </div>
          {!isSwapped(s) && <p className="mt-2 text-xs text-zinc-600">Rebuilding a race plan brings the original stations back.</p>}
        </section>
      )}

      {insights.prs.length > 0 && (
        <section className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <h2 className="text-sm font-medium text-emerald-300">New personal record{insights.prs.length === 1 ? "" : "s"}</h2>
          <ul className="mt-2 space-y-1 text-sm text-zinc-200">
            {insights.prs.map((p) => (
              <li key={p.exercise}>{prText(p)}</li>
            ))}
          </ul>
        </section>
      )}

      <DeloadNotice check={deloadCheck} />

      {insights.next.length > 0 && (
        <section className={`${card} mt-5`}>
          <h2 className="text-sm text-zinc-400">Next time</h2>
          <ul className="mt-2 divide-y divide-zinc-800 text-sm">
            {insights.next.map((n) => (
              <li key={n.exercise} className="py-2">
                <div className="flex justify-between gap-3">
                  <span>{n.exercise}</span>
                  <span className={`shrink-0 tabular-nums ${n.action === "up" ? "text-emerald-400" : n.action === "down" ? "text-amber-400" : "text-zinc-300"}`}>
                    {n.action === "same" ? `Stay at ${n.to} lb` : `${n.from} to ${n.to} lb`}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">{n.reason}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-600">Based on this session against its target reps. Dumbbell weights are per hand.</p>
        </section>
      )}

      {blockRows.length > 0 && (
        <section className={`${card} mt-5`}>
          <h2 className="text-sm text-zinc-400">{inProgress ? "Blocks so far" : "Block results"}</h2>
          <ul className="mt-2 divide-y divide-zinc-800 text-sm">
            {blockRows.map((b, i) => (
              <li key={i} className="flex justify-between py-2">
                <span>{b.name}</span>
                <span className={b.skipped ? "text-amber-400" : "tabular-nums text-zinc-400"}>
                  {b.skipped ? "skipped" : `${Math.floor((b.seconds ?? 0) / 60)}:${String((b.seconds ?? 0) % 60).padStart(2, "0")}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}

      {fuel && (
        <section className={`${card} mt-5 text-sm`}>
          <h2 className="text-zinc-400">Fuel this session</h2>
          <p className="mt-1 text-zinc-300">{fuel.text}</p>
          {totals && (
            <p className="mt-2 text-zinc-400">
              For this session: {totals.carbs[0]}-{totals.carbs[1]} g carbs, {totals.fluid[0]}-{totals.fluid[1]} ml fluid, {totals.sodium[0]}-{totals.sodium[1]} mg sodium.
            </p>
          )}
        </section>
      )}

      {(w.status === "completed" || w.status === "in_progress") && (w.planned_duration_min ?? 0) >= 45 && (
        <section className={`${card} mt-5 text-sm`}>
          <h2 className="text-zinc-400">What you took in</h2>
          {check && (
            <>
              <ul className="mt-2 divide-y divide-zinc-800">
                {check.rows.map((r) => (
                  <li key={r.label} className="flex justify-between gap-3 py-2">
                    <span>{r.label}</span>
                    <span className="text-right tabular-nums">
                      {r.actual === null ? <span className="text-zinc-500">not logged</span> : `${r.actual} ${r.unit} · ${r.perHour} ${r.unit}/h`}
                      <span className="block text-xs text-zinc-500">
                        range {r.range[0]}-{r.range[1]} {r.unit}/h
                        {r.status === "low" && <span className="text-amber-400"> · under</span>}
                        {r.status === "ok" && <span className="text-emerald-400"> · on target</span>}
                        {r.status === "high" && <span className="text-zinc-300"> · above</span>}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-zinc-300">{check.summary}</p>
            </>
          )}
          <form action={logSessionFuel} className="mt-3 grid grid-cols-3 gap-3">
            <input type="hidden" name="id" value={w.id} />
            <label className="text-xs text-zinc-400">
              Carbs (g)
              <input name="fuel_carbs_g" type="number" inputMode="decimal" min="0" defaultValue={w.fuel_carbs_g ?? ""} className={`${field} mt-1`} />
            </label>
            <label className="text-xs text-zinc-400">
              Fluid (ml)
              <input name="fluid_ml" type="number" inputMode="numeric" min="0" defaultValue={w.fluid_ml ?? ""} className={`${field} mt-1`} />
            </label>
            <label className="text-xs text-zinc-400">
              Sodium (mg)
              <input name="sodium_mg" type="number" inputMode="numeric" min="0" defaultValue={w.sodium_mg ?? ""} className={`${field} mt-1`} />
            </label>
            <button type="submit" className={`${btnGhost} col-span-3 px-3 py-2 text-sm`}>
              Save fuel and fluids
            </button>
          </form>
        </section>
      )}

      {w.status === "completed" && (
        <section className={`${card} mt-5 text-sm`}>
          <p className="font-medium text-emerald-400">Completed</p>
          <p className="mt-1 text-zinc-400">
            {w.actual_duration_min ? `${w.actual_duration_min} min` : ""}
            {w.rpe ? ` · RPE ${w.rpe}/10` : ""}
          </p>
          {(w.actual_distance_km || w.avg_hr || w.avg_power) && (
            <p className="mt-1 text-zinc-400">
              {w.actual_distance_km ? fmtDist(w.actual_distance_km, unit) : ""}
              {pace ? ` · ${pace}` : ""}
              {w.avg_hr ? ` · avg ${w.avg_hr} bpm` : ""}
              {w.avg_power ? ` · ${w.avg_power} W` : ""}
            </p>
          )}
          {w.activity_id && <p className="mt-1 text-xs text-zinc-500">From Garmin</p>}
          {w.notes && <p className="mt-2 whitespace-pre-line text-zinc-300">{w.notes}</p>}
        </section>
      )}

      {suggestions.length > 0 && (
        <section className={`${card} mt-5 text-sm`}>
          <h2 className="text-zinc-400">Did you already do this? Garmin has:</h2>
          <ul className="mt-2 divide-y divide-zinc-800">
            {suggestions.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate">{a.title || a.sport}</span>
                  <span className="block text-xs text-zinc-500">
                    {formatDay(a.started_at.slice(0, 10))}
                    {a.duration_sec ? ` · ${Math.round(a.duration_sec / 60)} min` : ""}
                    {a.distance_m ? ` · ${(Number(a.distance_m) / 1609.34).toFixed(1)} mi` : ""}
                    {a.avg_hr ? ` · ${a.avg_hr} bpm` : ""}
                  </span>
                </span>
                <form action={attachActivity}>
                  <input type="hidden" name="id" value={w.id} />
                  <input type="hidden" name="activity_id" value={a.id} />
                  <button type="submit" className={`${btnGhost} px-3 py-2 text-sm`}>
                    Use this
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 space-y-3">
        {w.status !== "completed" && (
          <Link href={`/workouts/${w.id}/start`} className={`${btnPrimary} block text-center`}>
            {inProgress ? "Resume" : hasGuide ? "Start workout" : "Start timer"}
          </Link>
        )}
        <div className="flex flex-wrap gap-2">
          {w.status !== "completed" && (
            <form action={setStatus}>
              <input type="hidden" name="id" value={w.id} />
              <input type="hidden" name="status" value="completed" />
              <button type="submit" className={`${btnGhost} px-3 py-2 text-sm`}>
                Mark done
              </button>
            </form>
          )}
          {w.status !== "skipped" && (
            <form action={setStatus}>
              <input type="hidden" name="id" value={w.id} />
              <input type="hidden" name="status" value="skipped" />
              <button type="submit" className={`${btnGhost} px-3 py-2 text-sm`}>
                Skip
              </button>
            </form>
          )}
          {w.status !== "planned" && (
            <form action={setStatus}>
              <input type="hidden" name="id" value={w.id} />
              <input type="hidden" name="status" value="planned" />
              <ConfirmButton
                className={`${btnGhost} px-3 py-2 text-sm`}
                message={inProgress ? "Discard the sets you've logged so far? This can't be undone." : w.status === "completed" ? "Reset this completed workout to planned? Its completed status and results are cleared." : "Reset this workout to planned?"}
              >
                {inProgress ? "Discard progress" : "Reset"}
              </ConfirmButton>
            </form>
          )}
          <form action={moveWorkout} className="flex w-full items-center gap-2">
            <label htmlFor="move-date" className="w-16 shrink-0 text-xs text-zinc-500">
              Move to
            </label>
            <input type="hidden" name="id" value={w.id} />
            <input id="move-date" name="date" type="date" defaultValue={w.workout_date} className={`${field} !w-auto flex-1`} />
            <button type="submit" className={`${btnGhost} px-3 py-2 text-sm`}>
              Move
            </button>
          </form>
          <Link href={`/workouts/${w.id}/edit`} className={`${btnGhost} px-3 py-2 text-sm`}>
            Customize
          </Link>
          <form action={duplicateWorkout} className="flex w-full items-center gap-2">
            <label htmlFor="copy-date" className="w-16 shrink-0 text-xs text-zinc-500">
              Copy to
            </label>
            <input type="hidden" name="id" value={w.id} />
            <input id="copy-date" name="date" type="date" defaultValue={w.workout_date} className={`${field} !w-auto flex-1`} />
            <button type="submit" className={`${btnGhost} px-3 py-2 text-sm`}>
              Copy to date
            </button>
          </form>
          <form action={deleteWorkout}>
            <input type="hidden" name="id" value={w.id} />
            <ConfirmButton message={`Delete "${w.title}"? You can undo right after.`} className="px-3 py-2 text-sm text-zinc-500 active:text-red-400">
              Delete
            </ConfirmButton>
          </form>
        </div>
      </div>
    </main>
  );
}

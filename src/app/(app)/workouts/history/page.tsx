import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDay } from "@/lib/dates";
import { exerciseIndex, sessionsFor, type SetRow } from "@/lib/history";
import { SPORT_NAME } from "@/lib/sport";
import { card, field } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { sessionUnits } from "@/lib/steps";
import { progressLabel } from "@/lib/progress";
import type { Workout } from "@/lib/types";

const mi = (km: number) => km / 1.609344;
const pace = (min: number, miles: number) => {
  const p = min / miles;
  return `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, "0")} /mi`;
};

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ q?: string; x?: string }> }) {
  const { q, x } = await searchParams;
  const { supabase } = await requireUser();

  const [{ data: setRows }, { data: cardio }, { data: partial }] = await Promise.all([
    supabase
      .from("workout_sets")
      .select("exercise,set_number,reps,weight_lb,rpe,skipped,workout_id,workouts(workout_date,title)")
      .order("created_at", { ascending: false })
      .limit(3000)
      .returns<SetRow[]>(),
    supabase
      .from("workouts")
      .select("*")
      .eq("status", "completed")
      .in("sport", ["run", "bike", "swim", "hyrox"])
      .order("workout_date", { ascending: false })
      .limit(60)
      .returns<Workout[]>(),
    supabase.from("workouts").select("*").eq("status", "in_progress").order("workout_date", { ascending: false }).returns<Workout[]>(),
  ]);
  const setCounts = new Map<string, number>();
  for (const r of setRows ?? []) setCounts.set(r.workout_id, (setCounts.get(r.workout_id) ?? 0) + 1);
  const rows = setRows ?? [];
  const term = (q ?? "").trim().toLowerCase();
  const index = exerciseIndex(rows).filter((e) => !term || e.name.toLowerCase().includes(term));
  const sessions = x ? sessionsFor(rows, x) : [];
  const trend = [...sessions].reverse().filter((s) => s.e1rm !== null);

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8">
      <Link href="/workouts" className="text-sm text-zinc-400">
        &larr; Training
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">History</h1>

      {x ? (
        <>
          <Link href="/workouts/history" className="mt-3 inline-block text-sm text-emerald-400">
            All exercises
          </Link>
          <h2 className="mt-2 text-xl font-semibold">{x}</h2>
          {sessions.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No logged sets for this exercise.</p>
          ) : (
            <>
              <section className={`${card} mt-4`}>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-zinc-500">Sessions</p>
                    <p className="text-xl font-semibold tabular-nums">{sessions.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Heaviest</p>
                    <p className="text-xl font-semibold tabular-nums">{Math.max(0, ...sessions.map((s) => s.topWeight ?? 0))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Est. 1RM</p>
                    <p className="text-xl font-semibold tabular-nums">{Math.round(Math.max(0, ...sessions.map((s) => s.e1rm ?? 0)))}</p>
                  </div>
                </div>
                {trend.length >= 2 && <Trend points={trend.map((s) => s.e1rm as number)} />}
                <p className="mt-2 text-xs text-zinc-500">Weights in lb. Est. 1RM uses the Epley formula on sets of up to 12 reps.</p>
              </section>
              <ul className="mt-4 space-y-3">
                {sessions.map((s) => (
                  <li key={s.workoutId} className={card}>
                    <Link href={`/workouts/${s.workoutId}`} className="flex justify-between text-sm">
                      <span>{formatDay(s.date, { weekday: true })}</span>
                      <span className="text-zinc-500">{s.title}</span>
                    </Link>
                    <p className="mt-1 text-sm tabular-nums text-zinc-300">
                      {s.sets.map((r) => (r.skipped ? "skipped" : `${r.weight_lb !== null ? `${Number(r.weight_lb)}×` : ""}${r.reps ?? "-"}${r.rpe ? ` @${r.rpe}` : ""}`)).join("  ·  ")}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <>
          <form className="mt-4">
            <input name="q" defaultValue={q ?? ""} placeholder="Search exercises" className={field} />
          </form>
          {(partial ?? []).length > 0 && (
            <>
              <h2 className="mt-5 text-sm text-amber-400">In progress</h2>
              <ul className="mt-2 divide-y divide-zinc-800 rounded-xl border border-amber-900/50">
                {(partial ?? []).map((w) => {
                  const u = sessionUnits(w);
                  return (
                    <li key={w.id}>
                      <Link href={`/workouts/${w.id}`} className="flex items-center justify-between gap-3 px-3 py-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{w.title}</span>
                          <span className="block text-xs text-zinc-500">
                            {formatDay(w.workout_date)} · {progressLabel(u.kind, w.progress, setCounts.get(w.id) ?? 0, u.total)}
                          </span>
                        </span>
                        <StatusBadge status="in_progress" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <h2 className="mt-5 text-sm text-zinc-400">Strength</h2>
          {index.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">{term ? "No match." : "Log sets in the workout assistant and they show up here."}</p>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-800 rounded-xl border border-zinc-800">
              {index.map((e) => (
                <li key={e.name}>
                  <Link href={`/workouts/history?x=${encodeURIComponent(e.name)}`} className="flex items-center justify-between gap-3 px-3 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{e.name}</span>
                      <span className="block text-xs text-zinc-500">
                        {e.sessions} session{e.sessions === 1 ? "" : "s"} · last {formatDay(e.last)}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-zinc-400">{e.best ? `${e.best} lb` : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-6 text-sm text-zinc-400">Endurance</h2>
          {(cardio ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Finish a run, ride or swim and it shows up here.</p>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-800 rounded-xl border border-zinc-800">
              {(cardio ?? [])
                .filter((w) => !term || w.title.toLowerCase().includes(term) || w.sport.includes(term))
                .map((w) => {
                  const m = w.actual_distance_km ? mi(w.actual_distance_km) : null;
                  return (
                    <li key={w.id}>
                      <Link href={`/workouts/${w.id}`} className="flex items-center justify-between gap-3 px-3 py-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{w.title}</span>
                          <span className="block text-xs text-zinc-500">
                            {formatDay(w.workout_date)} · {SPORT_NAME[w.sport]}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-xs tabular-nums text-zinc-400">
                          {m ? `${m.toFixed(1)} mi` : ""}
                          {m && w.actual_duration_min && w.sport !== "swim" ? ` · ${pace(w.actual_duration_min, m)}` : w.actual_duration_min ? `${w.actual_duration_min} min` : ""}
                        </span>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

function Trend({ points }: { points: number[] }) {
  const w = 280;
  const h = 56;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  const pts = points.map((v, i) => `${(i / (points.length - 1)) * w},${h - 4 - ((v - lo) / span) * (h - 8)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full" role="img" aria-label="Estimated one-rep max over time">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400" />
    </svg>
  );
}

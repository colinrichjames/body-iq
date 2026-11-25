import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addDays, formatDay } from "@/lib/dates";
import type { Workout } from "@/lib/types";
import { btnGhost, btnPrimary, card } from "@/components/ui";
import { sessionFuel } from "@/lib/fuel";
import { field } from "@/components/ui";
import { attachActivity, deleteWorkout, duplicateWorkout, moveWorkout, setStatus } from "../actions";
import { garminSport } from "@/lib/sport";

export default async function WorkoutPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase } = await requireUser();
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
  const miles = w.actual_distance_km ? w.actual_distance_km / 1.609344 : null;
  const pace =
    miles && w.actual_duration_min && w.sport !== "swim"
      ? (() => {
          const p = w.actual_duration_min / miles;
          return `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, "0")} /mi`;
        })()
      : null;
  const fuel = sessionFuel(w);
  const hasGuide = !!(s?.exercises?.length || s?.blocks?.length);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href={`/workouts?d=${w.workout_date}`} className="text-sm text-zinc-400">
        &larr; Training
      </Link>
      <p className="mt-3 text-xs uppercase tracking-wider text-zinc-500">
        {formatDay(w.workout_date, { weekday: true, year: true })} &middot; {w.sport}
        {w.planned_duration_min ? ` · ${w.planned_duration_min} min` : ""}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{w.title}</h1>
      {w.description && <p className="mt-3 whitespace-pre-line text-zinc-300">{w.description}</p>}

      {s?.exercises && s.exercises.length > 0 && (
        <section className={`${card} mt-5`}>
          <h2 className="text-sm text-zinc-400">
            {s.rounds ? `${s.rounds} rounds, rest ${s.rest_sec ?? 60}s between rounds` : "Exercises"}
          </h2>
          <ul className="mt-2 divide-y divide-zinc-800">
            {s.exercises.map((e, i) => (
              <li key={i} className="flex justify-between gap-3 py-2 text-sm">
                <span>{e.name}</span>
                <span className="text-zinc-400">
                  {e.seconds ? `${e.seconds}s` : `${e.sets ? `${e.sets} x ` : ""}${e.reps ?? ""}`}
                  {e.weight_lb ? ` @ ${e.weight_lb} lb` : ""}
                </span>
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

      {error && <p className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}

      {fuel && (
        <section className={`${card} mt-5 text-sm`}>
          <h2 className="text-zinc-400">Fuel this session</h2>
          <p className="mt-1 text-zinc-300">{fuel.text}</p>
        </section>
      )}

      {w.status === "completed" && (
        <section className={`${card} mt-5 text-sm`}>
          <p className="font-medium text-emerald-400">Completed</p>
          <p className="mt-1 text-zinc-400">
            {w.actual_duration_min ? `${w.actual_duration_min} min` : ""}
            {w.rpe ? ` · RPE ${w.rpe}/10` : ""}
          </p>
          {(miles || w.avg_hr || w.avg_power) && (
            <p className="mt-1 text-zinc-400">
              {miles ? `${miles.toFixed(2)} mi` : ""}
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
            {hasGuide ? "Start workout" : "Start timer"}
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
              <button type="submit" className={`${btnGhost} px-3 py-2 text-sm`}>
                Reset
              </button>
            </form>
          )}
          <form action={moveWorkout} className="flex w-full items-center gap-2">
            <input type="hidden" name="id" value={w.id} />
            <input name="date" type="date" defaultValue={w.workout_date} className={`${field} !w-auto flex-1`} />
            <button type="submit" className={`${btnGhost} px-3 py-2 text-sm`}>
              Move
            </button>
          </form>
          <Link href={`/workouts/${w.id}/edit`} className={`${btnGhost} px-3 py-2 text-sm`}>
            Customize
          </Link>
          <form action={duplicateWorkout} className="flex w-full items-center gap-2">
            <input type="hidden" name="id" value={w.id} />
            <input name="date" type="date" defaultValue={w.workout_date} className={`${field} !w-auto flex-1`} />
            <button type="submit" className={`${btnGhost} px-3 py-2 text-sm`}>
              Copy to date
            </button>
          </form>
          <form action={deleteWorkout}>
            <input type="hidden" name="id" value={w.id} />
            <button type="submit" className="px-3 py-2 text-sm text-zinc-500 active:text-red-400">
              Delete
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

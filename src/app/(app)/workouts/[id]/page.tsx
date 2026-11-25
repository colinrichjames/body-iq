import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatDay } from "@/lib/dates";
import type { Workout } from "@/lib/types";
import { btnGhost, btnPrimary, card } from "@/components/ui";
import { deleteWorkout, setStatus } from "../actions";

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: w } = await supabase.from("workouts").select("*").eq("id", id).maybeSingle<Workout>();
  if (!w) notFound();

  const s = w.structure;
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

      {w.status === "completed" && (
        <section className={`${card} mt-5 text-sm`}>
          <p className="font-medium text-emerald-400">Completed</p>
          <p className="mt-1 text-zinc-400">
            {w.actual_duration_min ? `${w.actual_duration_min} min` : ""}
            {w.rpe ? ` · RPE ${w.rpe}/10` : ""}
          </p>
          {w.notes && <p className="mt-2 whitespace-pre-line text-zinc-300">{w.notes}</p>}
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

import { fromKm } from "@/lib/distance";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { btnPrimary, field } from "@/components/ui";
import type { Workout } from "@/lib/types";
import { updateWorkout } from "../../actions";
import { ExerciseEditor } from "../../exercise-editor";

export default async function EditWorkoutPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase } = await requireUser();
  const { data: w } = await supabase.from("workouts").select("*").eq("id", id).maybeSingle<Workout>();
  if (!w) notFound();
  const s = w.structure;
  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href={`/workouts/${id}`} className="text-sm text-zinc-400">
        &larr; Back
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Customize workout</h1>
      {error && <p className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}
      <form action={updateWorkout} className="mt-6 space-y-3">
        <input type="hidden" name="id" value={id} />
        <input name="title" defaultValue={w.title} required className={field} />
        <div className="grid grid-cols-2 gap-3">
          <select name="sport" defaultValue={w.sport} className={field}>
            {["run", "bike", "swim", "strength", "hyrox", "mobility", "other"].map((x) => (
              <option key={x} value={x}>
                {x[0].toUpperCase() + x.slice(1)}
              </option>
            ))}
          </select>
          <input name="planned_duration_min" type="number" inputMode="numeric" min="1" defaultValue={w.planned_duration_min ?? ""} placeholder="Minutes" className={field} />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <input name="planned_distance" type="number" inputMode="decimal" step="any" min="0" defaultValue={w.planned_distance_km ? fromKm(w.planned_distance_km, w.distance_unit) : ""} placeholder="Distance (optional)" className={field} aria-label="Planned distance" />
          <select name="distance_unit" defaultValue={w.distance_unit} className={field} aria-label="Distance unit">
            <option value="mi">mi</option>
            <option value="km">km</option>
          </select>
        </div>
        <input name="workout_date" type="date" defaultValue={w.workout_date} required className={field} />
        <textarea name="description" rows={4} defaultValue={w.description ?? ""} placeholder="Notes and details" className={field} />
        <ExerciseEditor initial={s?.exercises ?? []} />
        <div className="grid grid-cols-2 gap-3">
          <input name="rounds" type="number" inputMode="numeric" min="1" defaultValue={s?.rounds ?? ""} placeholder="Circuit rounds" className={field} />
          <input name="rest_sec" type="number" inputMode="numeric" min="0" defaultValue={s?.rest_sec ?? ""} placeholder="Rest seconds" className={field} />
        </div>
        {s?.blocks && s.blocks.length > 0 && <p className="text-xs text-zinc-500">This session&apos;s timed blocks are kept as they are.</p>}
        <p className="text-xs text-zinc-500">Saving marks this session as yours, so plan re-alignment won&apos;t overwrite it.</p>
        <button type="submit" className={`${btnPrimary} w-full`}>
          Save changes
        </button>
      </form>
    </main>
  );
}

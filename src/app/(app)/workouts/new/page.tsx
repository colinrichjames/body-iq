import Link from "next/link";
import { getToday } from "@/lib/today";
import { btnPrimary, field } from "@/components/ui";
import { addWorkout } from "../actions";
import { ExerciseEditor } from "../exercise-editor";

export default async function NewWorkoutPage({ searchParams }: { searchParams: Promise<{ error?: string; date?: string }> }) {
  const { error, date } = await searchParams;
  const today = await getToday();
  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href="/workouts" className="text-sm text-zinc-400">
        &larr; Training
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Add workout</h1>
      {error && <p className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}
      <form action={addWorkout} className="mt-6 space-y-3">
        <input name="title" placeholder="Title, e.g. Tempo run" required className={field} />
        <div className="grid grid-cols-2 gap-3">
          <select name="sport" defaultValue="run" className={field}>
            <option value="run">Run</option>
            <option value="bike">Bike</option>
            <option value="swim">Swim</option>
            <option value="strength">Strength</option>
            <option value="hyrox">Hyrox</option>
            <option value="mobility">Mobility</option>
            <option value="other">Other</option>
          </select>
          <input name="planned_duration_min" type="number" inputMode="numeric" min="1" placeholder="Minutes" className={field} />
        </div>
        <input name="workout_date" type="date" defaultValue={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today} required className={field} />
        <textarea name="description" rows={4} placeholder="Details, e.g. 10 min warm-up, 3 x 8 min at threshold" className={field} />
        <ExerciseEditor initial={[]} />
        <div className="grid grid-cols-2 gap-3">
          <input name="rounds" type="number" inputMode="numeric" min="1" placeholder="Circuit rounds (optional)" className={field} />
          <input name="rest_sec" type="number" inputMode="numeric" min="0" placeholder="Rest seconds" className={field} />
        </div>
        <button type="submit" className={`${btnPrimary} w-full`}>
          Save workout
        </button>
      </form>
    </main>
  );
}

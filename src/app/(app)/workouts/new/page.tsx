import { SubmitButton } from "@/components/submit-button";
import Link from "next/link";
import { getToday } from "@/lib/today";
import { requireUser } from "@/lib/auth";
import type { Profile } from "@/lib/types";
import { btnPrimary, field } from "@/components/ui";
import { addWorkout } from "../actions";
import { ExerciseEditor } from "../exercise-editor";
import { DraftForm } from "@/components/draft-form";
import { Field } from "@/components/field";
import { PaceHint } from "@/components/pace-hint";

export default async function NewWorkoutPage({ searchParams }: { searchParams: Promise<{ error?: string; date?: string }> }) {
  const { error, date } = await searchParams;
  const today = await getToday();
  const { supabase, userId } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("unit_system").eq("id", userId).maybeSingle<Pick<Profile, "unit_system">>();
  const defaultUnit = profile?.unit_system === "metric" ? "km" : "mi";
  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href="/workouts" className="text-sm text-zinc-400">
        &larr; Training
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Add workout</h1>
      {error && <p className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}
      <DraftForm action={addWorkout} draftKey="workout-new" className="mt-6 space-y-3">
        <Field label="Title"><input name="title" placeholder="e.g. Tempo run" required className={field} /></Field>
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
          <Field label="Minutes"><input name="planned_duration_min" type="number" inputMode="numeric" min="1" className={field} /></Field>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Planned distance (optional)"><input name="planned_distance" type="number" inputMode="decimal" step="any" min="0" defaultValue={""} className={field} /></Field>
          <select name="distance_unit" defaultValue={defaultUnit} className={field} aria-label="Distance unit">
            <option value="mi">mi</option>
            <option value="km">km</option>
          </select>
        </div>
        <PaceHint />
        <input name="workout_date" type="date" defaultValue={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today} required className={field} />
        <Field label="Details"><textarea name="description" rows={4} placeholder="e.g. 10 min warm-up, 3 x 8 min at threshold" className={field} /></Field>
        <ExerciseEditor initial={[]} draftKey="workout-new" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Circuit rounds (optional)"><input name="rounds" type="number" inputMode="numeric" min="1" className={field} /></Field>
          <Field label="Rest seconds"><input name="rest_sec" type="number" inputMode="numeric" min="0" className={field} /></Field>
        </div>
        <SubmitButton className={`${btnPrimary} w-full`}>Save workout</SubmitButton>
      </DraftForm>
    </main>
  );
}

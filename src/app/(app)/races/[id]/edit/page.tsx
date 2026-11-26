import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getToday } from "@/lib/today";
import { fmtTime } from "@/lib/hyrox";
import { RACE_TYPES } from "@/lib/plan";
import type { Race } from "@/lib/types";
import { btnGhost, btnPrimary, card, field } from "@/components/ui";
import { DraftForm } from "@/components/draft-form";
import { Field } from "@/components/field";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteRace, updateRace } from "../../actions";

export default async function EditRacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase } = await requireUser();
  const today = await getToday();
  const { data: race } = await supabase.from("races").select("*").eq("id", id).maybeSingle<Race>();
  if (!race) notFound();
  const { count } = await supabase
    .from("workouts")
    .select("id", { count: "exact", head: true })
    .eq("race_id", id)
    .eq("generated", true)
    .eq("status", "planned")
    .gte("workout_date", today);
  const left = count ?? 0;

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href={`/races/${id}`} className="text-sm text-zinc-400">
        &larr; {race.name}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Edit race</h1>
      {error && <p className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}

      <DraftForm action={updateRace} draftKey={`race-edit-${id}`} className={`${card} mt-5 space-y-3`}>
        <input type="hidden" name="id" value={id} />
        <Field label="Race name"><input name="name" required defaultValue={race.name} className={field} /></Field>
        <Field label="Race type">
          <select name="race_type" defaultValue={race.race_type} className={field}>
            {RACE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Race date"><input name="race_date" type="date" required defaultValue={race.race_date} className={field} /></Field>
        <Field label="Location (optional)"><input name="location" defaultValue={race.location ?? ""} className={field} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <select name="priority" defaultValue={race.priority} className={field}>
              <option value="A">A race</option>
              <option value="B">B race</option>
              <option value="C">C race</option>
            </select>
          </Field>
          <Field label="Goal time (optional)"><input name="goal_time" defaultValue={race.goal_time_sec ? fmtTime(race.goal_time_sec) : ""} placeholder="e.g. 1:20:00" className={field} /></Field>
        </div>
        <Field label="Other goals (optional)"><input name="goal" defaultValue={race.goal ?? ""} className={field} /></Field>

        <div className="rounded-xl border border-zinc-800 p-3 text-sm">
          <label className="flex items-start gap-2 text-zinc-300">
            <input name="rebuild" type="checkbox" defaultChecked className="mt-0.5 size-4 accent-emerald-500" />
            <span>
              Rebuild the training plan if the date, type or priority changed
              <span className="mt-1 block text-xs text-zinc-500">
                {left > 0 ? `Replaces your ${left} unfinished generated session${left === 1 ? "" : "s"} from today on.` : "There are no unfinished generated sessions to replace; this will add a new plan."} Completed sessions, skipped sessions and ones you added yourself stay. Days that already have a workout are left alone.
              </span>
            </span>
          </label>
        </div>

        <button type="submit" className={`${btnPrimary} w-full`}>
          Save changes
        </button>
        <Link href={`/races/${id}`} className={`${btnGhost} block text-center`}>
          Cancel
        </Link>
      </DraftForm>
      <form action={deleteRace} className="mt-6 text-center">
        <input type="hidden" name="id" value={id} />
        <ConfirmButton message={`Delete ${race.name}? Its unfinished planned sessions are deleted too; completed workouts stay. You can undo right after.`} className="px-3 py-2 text-sm text-zinc-500 active:text-red-400">
          Delete race
        </ConfirmButton>
      </form>
    </main>
  );
}

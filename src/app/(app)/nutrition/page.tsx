import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { addDays, formatDay } from "@/lib/dates";
import { getToday } from "@/lib/today";
import { macroMismatch, targetsFor } from "@/lib/targets";
import type { NutritionDay, Profile, Workout } from "@/lib/types";
import { btnGhost, card, field } from "@/components/ui";
import { quickAdd, saveTargets } from "./actions";
import { Importer } from "./importer";
import { DraftForm } from "@/components/draft-form";
import { SubmitButton } from "@/components/submit-button";
import { Field } from "@/components/field";
import { CoachCard } from "@/components/coach-card";
import { loadCoach } from "@/lib/coach-data";

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export default async function NutritionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, userId } = await requireUser();
  const today = await getToday();
  const since = addDays(today, -13);

  const [{ data: profile }, { data: days }, { data: wk }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>(),
    supabase.from("nutrition_days").select("*").gte("day", since).order("day", { ascending: false }).returns<NutritionDay[]>(),
    supabase.from("workouts").select("*").gte("workout_date", since).lte("workout_date", today).returns<Workout[]>(),
  ]);
  const coach = await loadCoach(supabase, today, profile ?? null);
  const workouts = wk ?? [];
  const rows = days ?? [];
  const week = rows.filter((d) => d.day >= addDays(today, -6) && (d.calories ?? 0) > 0);

  // Targets differ on training and rest days, so compare against the average of each logged day's own target.
  const avgTarget = (pick: (t: ReturnType<typeof targetsFor>) => number | null) => {
    const vals = week.map((d) => pick(targetsFor(d.day, workouts, profile ?? null))).filter((v): v is number => v !== null);
    return avg(vals);
  };
  const stats = [
    { label: "Calories", unit: "", value: avg(week.map((d) => d.calories ?? 0)), target: avgTarget((t) => t.calories) },
    { label: "Protein", unit: " g", value: avg(week.map((d) => d.protein_g ?? 0)), target: avgTarget((t) => t.protein) },
    { label: "Carbs", unit: " g", value: avg(week.map((d) => d.carbs_g ?? 0)), target: avgTarget((t) => t.carbs) },
    { label: "Fat", unit: " g", value: avg(week.map((d) => d.fat_g ?? 0)), target: avgTarget((t) => t.fat) },
  ];

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Nutrition</h1>
      {error && <p className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}

      <CoachCard coach={coach} today={today} from="/nutrition" />

      <section className={`${card} mt-5`}>
        <h2 className="text-sm text-zinc-400">Average vs target</h2>
        {week.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No food logged in the last 7 days. Log food, import a MyFitnessPal export or quick add a day below.</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-4">
              {stats.map((s) => (
                <div key={s.label}>
                  <p className="text-xs text-zinc-500">{s.label}</p>
                  <p className="text-xl font-semibold tabular-nums">
                    {s.value === null ? "--" : Math.round(s.value)}
                    <span className="text-sm font-normal text-zinc-500">{s.unit}</span>
                  </p>
                  <p className="text-xs text-zinc-500">{s.target ? `target ${Math.round(s.target)}${s.unit}` : "no target"}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">Average over {week.length} logged day{week.length === 1 ? "" : "s"} in the last 7 days.</p>
          </>
        )}
      </section>

      <Link href="/nutrition/log" className="mt-5 block rounded-2xl bg-emerald-500 px-4 py-3.5 text-center font-medium text-zinc-950 active:bg-emerald-400">
        Log food: scan, search or add by hand
      </Link>

      <Importer />

      <DraftForm action={quickAdd} draftKey="nutrition-quick-add" className={`${card} mt-6 space-y-3`}>
        <h2 className="font-medium">Quick add a day</h2>
        <p className="text-sm text-zinc-500">Type in a day&apos;s totals. They go into your food log as one &quot;Quick add&quot; line for that date (replacing an earlier quick add). Foods you logged that day stay.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" className="col-span-2"><input name="day" type="date" defaultValue={today} required className={field} /></Field>
          <Field label="Calories"><input name="calories" type="number" inputMode="numeric" required className={field} /></Field>
          <Field label="Protein (g)"><input name="protein_g" type="number" inputMode="decimal" className={field} /></Field>
          <Field label="Carbs (g)"><input name="carbs_g" type="number" inputMode="decimal" className={field} /></Field>
          <Field label="Fat (g)"><input name="fat_g" type="number" inputMode="decimal" className={field} /></Field>
        </div>
        <SubmitButton className={`${btnGhost} w-full`}>Add to food log</SubmitButton>
      </DraftForm>

      <form action={saveTargets} className={`${card} mt-6 space-y-4`}>
        <h2 className="font-medium">Daily targets</h2>
        <p className="text-sm text-zinc-500">Training days use the first set. Rest days use the second; leave it blank to use the training-day numbers.</p>
        <fieldset className="space-y-2">
          <legend className="text-sm text-zinc-300">Training day</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Calories"><input name="calorie_target" type="number" inputMode="numeric" defaultValue={profile?.calorie_target ?? ""} className={field} /></Field>
            <Field label="Protein (g)"><input name="protein_target_g" type="number" inputMode="numeric" defaultValue={profile?.protein_target_g ?? ""} className={field} /></Field>
            <Field label="Carbs (g)"><input name="carbs_target_g" type="number" inputMode="numeric" defaultValue={profile?.carbs_target_g ?? ""} className={field} /></Field>
            <Field label="Fat (g)"><input name="fat_target_g" type="number" inputMode="numeric" defaultValue={profile?.fat_target_g ?? ""} className={field} /></Field>
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm text-zinc-300">Rest day</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Calories"><input name="rest_calorie_target" type="number" inputMode="numeric" defaultValue={profile?.rest_calorie_target ?? ""} className={field} /></Field>
            <Field label="Protein (g)"><input name="rest_protein_g" type="number" inputMode="numeric" defaultValue={profile?.rest_protein_g ?? ""} className={field} /></Field>
            <Field label="Carbs (g)"><input name="rest_carbs_g" type="number" inputMode="numeric" defaultValue={profile?.rest_carbs_g ?? ""} className={field} /></Field>
            <Field label="Fat (g)"><input name="rest_fat_g" type="number" inputMode="numeric" defaultValue={profile?.rest_fat_g ?? ""} className={field} /></Field>
          </div>
        </fieldset>
        {[
          { label: "training day", t: { calories: profile?.calorie_target ?? null, protein: profile?.protein_target_g ?? null, carbs: profile?.carbs_target_g ?? null, fat: profile?.fat_target_g ?? null } },
          { label: "rest day", t: { calories: profile?.rest_calorie_target ?? null, protein: profile?.rest_protein_g ?? null, carbs: profile?.rest_carbs_g ?? null, fat: profile?.rest_fat_g ?? null } },
        ].map((x) => {
          const m = macroMismatch(x.t);
          return m ? (
            <p key={x.label} className="rounded-xl border border-amber-900 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
              {x.label[0].toUpperCase() + x.label.slice(1)}: {m} Adjust one so they agree.
            </p>
          ) : null;
        })}
        <SubmitButton className={`${btnGhost} w-full`}>Save targets</SubmitButton>
      </form>

      <h2 className="mt-8 text-sm text-zinc-400">Last 14 days</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">Nothing yet.</p>
      ) : (
        <table className="mt-2 w-full text-sm tabular-nums">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="py-1 font-normal">Day</th>
              <th className="py-1 text-right font-normal">Cal</th>
              <th className="py-1 text-right font-normal">P</th>
              <th className="py-1 text-right font-normal">C</th>
              <th className="py-1 text-right font-normal">F</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {rows.map((d) => (
              <tr key={d.day}>
                <td className="py-2"><Link href={`/nutrition/log?d=${d.day}`} className="text-zinc-400 underline-offset-2 active:underline">{formatDay(d.day)}</Link></td>
                <td className="py-2 text-right">{Math.round(d.calories ?? 0)}</td>
                <td className="py-2 text-right">{Math.round(d.protein_g ?? 0)}</td>
                <td className="py-2 text-right">{Math.round(d.carbs_g ?? 0)}</td>
                <td className="py-2 text-right">{Math.round(d.fat_g ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

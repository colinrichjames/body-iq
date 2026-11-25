import { requireUser } from "@/lib/auth";
import { addDays, formatDay } from "@/lib/dates";
import { getToday } from "@/lib/today";
import type { NutritionDay, Profile } from "@/lib/types";
import { btnGhost, card, field } from "@/components/ui";
import { saveTargets } from "./actions";
import { Importer } from "./importer";

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export default async function NutritionPage() {
  const { supabase, userId } = await requireUser();
  const today = await getToday();
  const since = addDays(today, -13);

  const [{ data: profile }, { data: days }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>(),
    supabase.from("nutrition_days").select("*").gte("day", since).order("day", { ascending: false }).returns<NutritionDay[]>(),
  ]);
  const rows = days ?? [];
  const week = rows.filter((d) => d.day >= addDays(today, -6) && (d.calories ?? 0) > 0);

  const stats = [
    { label: "Calories", unit: "", value: avg(week.map((d) => d.calories ?? 0)), target: profile?.calorie_target },
    { label: "Protein", unit: " g", value: avg(week.map((d) => d.protein_g ?? 0)), target: profile?.protein_target_g },
    { label: "Carbs", unit: " g", value: avg(week.map((d) => d.carbs_g ?? 0)), target: profile?.carbs_target_g },
    { label: "Fat", unit: " g", value: avg(week.map((d) => d.fat_g ?? 0)), target: profile?.fat_target_g },
  ];

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Nutrition</h1>

      <section className={`${card} mt-5`}>
        <h2 className="text-sm text-zinc-400">7-day average vs target</h2>
        {week.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No food logged in the last 7 days. Import a MyFitnessPal export below.</p>
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
                  <p className="text-xs text-zinc-500">{s.target ? `target ${s.target}${s.unit}` : "no target"}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">Based on {week.length} logged day(s).</p>
          </>
        )}
      </section>

      <Importer />

      <form action={saveTargets} className={`${card} mt-6 space-y-3`}>
        <h2 className="font-medium">Daily targets</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-zinc-400">
            Calories
            <input name="calorie_target" type="number" inputMode="numeric" defaultValue={profile?.calorie_target ?? ""} className={`${field} mt-1`} />
          </label>
          <label className="text-sm text-zinc-400">
            Protein (g)
            <input name="protein_target_g" type="number" inputMode="numeric" defaultValue={profile?.protein_target_g ?? ""} className={`${field} mt-1`} />
          </label>
          <label className="text-sm text-zinc-400">
            Carbs (g)
            <input name="carbs_target_g" type="number" inputMode="numeric" defaultValue={profile?.carbs_target_g ?? ""} className={`${field} mt-1`} />
          </label>
          <label className="text-sm text-zinc-400">
            Fat (g)
            <input name="fat_target_g" type="number" inputMode="numeric" defaultValue={profile?.fat_target_g ?? ""} className={`${field} mt-1`} />
          </label>
        </div>
        <button type="submit" className={`${btnGhost} w-full`}>
          Save targets
        </button>
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
                <td className="py-2 text-zinc-400">{formatDay(d.day)}</td>
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

import { requireUser } from "@/lib/auth";
import Link from "next/link";
import { diffDays, formatDay } from "@/lib/dates";
import { fmtTime } from "@/lib/hyrox";
import { currentPhase, RACE_TYPES, raceLabel } from "@/lib/plan";
import { getToday } from "@/lib/today";
import type { Race } from "@/lib/types";
import { btnGhost, btnPrimary, card, field } from "@/components/ui";
import { addRace, deleteRace, regeneratePlan } from "./actions";

export default async function RacesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase } = await requireUser();
  const today = await getToday();
  const { data } = await supabase.from("races").select("*").order("race_date").returns<Race[]>();
  const races = data ?? [];
  const upcoming = races.filter((r) => r.race_date >= today);
  const past = races.filter((r) => r.race_date < today).reverse();

  const { data: counts } = await supabase
    .from("workouts")
    .select("race_id")
    .eq("status", "planned")
    .gte("workout_date", today)
    .not("race_id", "is", null);
  const remaining = new Map<string, number>();
  for (const w of counts ?? []) remaining.set(w.race_id as string, (remaining.get(w.race_id as string) ?? 0) + 1);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Races</h1>
      <p className="mt-1 text-sm text-zinc-500">Add a race and a date. Body IQ builds the training plan backwards from race day.</p>

      {error && <p className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}

      <form action={addRace} className={`${card} mt-6 space-y-3`}>
        <h2 className="font-medium">Add a race</h2>
        <input name="name" placeholder="Race name" required className={field} />
        <select name="race_type" defaultValue="marathon" className={field}>
          {RACE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="block text-sm text-zinc-400">
          Race date
          <input name="race_date" type="date" required min={today} className={`${field} mt-1`} />
        </label>
        <input name="location" placeholder="Location (optional)" className={field} />
        <div className="grid grid-cols-2 gap-3">
          <select name="priority" defaultValue="A" className={field} aria-label="Priority">
            <option value="A">A race</option>
            <option value="B">B race</option>
            <option value="C">C race</option>
          </select>
          <input name="goal_time" placeholder="Goal time, e.g. 1:20:00" className={field} />
        </div>
        <input name="goal" placeholder="Other goals (optional)" className={field} />
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input name="generate" type="checkbox" defaultChecked className="size-4 accent-emerald-500" />
          Generate a training plan
        </label>
        <button type="submit" className={`${btnPrimary} w-full`}>
          Add race
        </button>
      </form>

      <h2 className="mt-8 text-sm text-zinc-400">Upcoming</h2>
      {upcoming.length === 0 && <p className="mt-2 text-sm text-zinc-500">No upcoming races yet.</p>}
      <ul className="mt-2 space-y-3">
        {upcoming.map((r) => {
          const days = diffDays(today, r.race_date);
          const phase = currentPhase(r.race_type, r.race_date, today);
          const n = remaining.get(r.id) ?? 0;
          return (
            <li key={r.id} className={card}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/races/${r.id}`} className="font-medium underline-offset-2 active:underline">
                    {r.name} <span className="text-xs font-normal text-zinc-500">({r.priority})</span>
                  </Link>
                  <p className="text-sm text-zinc-400">
                    {raceLabel(r.race_type)} &middot; {formatDay(r.race_date, { weekday: true, year: true })}
                  </p>
                  {r.location && <p className="text-sm text-zinc-500">{r.location}</p>}
                  {(r.goal_time_sec || r.goal) && (
                    <p className="text-sm text-zinc-500">
                      Goal: {[r.goal_time_sec ? fmtTime(r.goal_time_sec) : null, r.goal].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold tabular-nums text-emerald-400">{days}</p>
                  <p className="text-xs text-zinc-500">{days === 1 ? "day" : "days"}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-zinc-400">
                {n > 0 ? `${n} planned sessions left${phase ? `, ${phase} phase` : ""}.` : "No plan generated yet."}
              </p>
              <div className="mt-3 flex gap-2">
                <form action={regeneratePlan}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className={`${btnGhost} px-3 py-2 text-sm`}>
                    {n > 0 ? "Rebuild plan" : "Generate plan"}
                  </button>
                </form>
                <form action={deleteRace}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="px-3 py-2 text-sm text-zinc-500 active:text-red-400">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>

      {past.length > 0 && (
        <>
          <h2 className="mt-8 text-sm text-zinc-400">Past</h2>
          <ul className="mt-2 space-y-2">
            {past.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm text-zinc-400">
                <span>
                  {r.name} &middot; {formatDay(r.race_date, { weekday: false, year: true })}
                </span>
                <form action={deleteRace}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="text-zinc-600 active:text-red-400">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

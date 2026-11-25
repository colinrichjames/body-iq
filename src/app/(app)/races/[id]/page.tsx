import { ConfirmButton } from "@/components/confirm-button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { diffDays, formatDay } from "@/lib/dates";
import { BENCHMARK_KEYS, fmtTime, hyroxSplits, isHyrox, STATIONS } from "@/lib/hyrox";
import { currentPhase, raceLabel } from "@/lib/plan";
import { getToday } from "@/lib/today";
import type { HyroxBenchmark, Race } from "@/lib/types";
import { btnGhost, card, field } from "@/components/ui";
import { addBenchmark, deleteBenchmark } from "../actions";
import { PlanImporter } from "./plan-importer";
import { Field } from "@/components/field";

export default async function RacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase } = await requireUser();
  const today = await getToday();
  const { data: race } = await supabase.from("races").select("*").eq("id", id).maybeSingle<Race>();
  if (!race) notFound();

  const hyrox = isHyrox(race.race_type);
  const { data: bm } = hyrox
    ? await supabase.from("hyrox_benchmarks").select("*").order("effort_date", { ascending: false }).returns<HyroxBenchmark[]>()
    : { data: [] as HyroxBenchmark[] };
  const benchmarks = bm ?? [];
  const days = diffDays(today, race.race_date);
  const phase = currentPhase(race.race_type, race.race_date, today);
  const plan = race.goal_time_sec && hyrox ? hyroxSplits(race.goal_time_sec) : null;
  const targetByStation = new Map(plan?.splits.filter((s) => s.key).map((s) => [s.key!, s.sec]));
  const runTarget = plan ? plan.runSec / 8 : null;

  const latest = new Map<string, HyroxBenchmark>();
  const best = new Map<string, number>();
  for (const b of benchmarks) {
    if (!latest.has(b.station)) latest.set(b.station, b);
    best.set(b.station, Math.min(best.get(b.station) ?? Infinity, b.time_sec));
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href="/races" className="text-sm text-zinc-400">
        &larr; Races
      </Link>
      <p className="mt-3 text-xs uppercase tracking-wider text-zinc-500">
        {raceLabel(race.race_type)} &middot; {race.priority} race
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{race.name}</h1>
      <p className="mt-1 text-zinc-400">
        {formatDay(race.race_date, { weekday: true, year: true })}
        {race.location ? ` · ${race.location}` : ""}
      </p>
      <p className="mt-2 text-sm text-zinc-300">
        {days >= 0 ? `${days} days to go${phase ? `, ${phase} phase` : ""}.` : "Race complete."}
        {race.goal_time_sec ? ` Goal ${fmtTime(race.goal_time_sec)}.` : ""}
      </p>
      {error && <p className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}

      {hyrox && (
        <>
          <section className={`${card} mt-6`}>
            <h2 className="font-medium">Race structure</h2>
            <p className="mt-1 text-sm text-zinc-500">
              8 x 1 km run, each followed by a station.{race.race_type === "hyrox_doubles" ? " In doubles you split the work on each station; the run is together." : ""}
            </p>
            {!plan ? (
              <p className="mt-3 text-sm text-zinc-400">
                Add a goal time to this race to get target splits. Station order: {STATIONS.map((s) => s.label).join(", ")}.
              </p>
            ) : (
              <>
                <table className="mt-3 w-full text-sm tabular-nums">
                  <tbody className="divide-y divide-zinc-900">
                    {plan.splits.map((s, i) => (
                      <tr key={i} className={s.kind === "run" ? "text-zinc-400" : ""}>
                        <td className="py-1.5">{s.label}</td>
                        <td className="py-1.5 text-right text-zinc-500">
                          {s.kind === "station" ? STATIONS.find((x) => x.key === s.key)?.work : "1 km"}
                        </td>
                        <td className="py-1.5 text-right font-medium">{fmtTime(s.sec)}</td>
                      </tr>
                    ))}
                    <tr className="text-zinc-400">
                      <td className="py-1.5">Roxzone (all transitions)</td>
                      <td />
                      <td className="py-1.5 text-right">{fmtTime(plan.roxzoneSec)}</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 font-medium">Total</td>
                      <td />
                      <td className="py-1.5 text-right font-medium">{fmtTime(race.goal_time_sec!)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-zinc-500">
                  Starting split: 50% running, 6% Roxzone, the rest weighted across stations. These are rules of thumb. Log benchmark efforts below and adjust.
                </p>
              </>
            )}
          </section>

          <section className={`${card} mt-4`}>
            <h2 className="font-medium">Station benchmarks</h2>
            <table className="mt-3 w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-zinc-500">
                <tr>
                  <th className="py-1 font-normal">Station</th>
                  <th className="py-1 text-right font-normal">Latest</th>
                  <th className="py-1 text-right font-normal">Best</th>
                  <th className="py-1 text-right font-normal">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {BENCHMARK_KEYS.map((k) => {
                  const l = latest.get(k.key);
                  const target = k.key === "run_1km" ? runTarget : (targetByStation.get(k.key) ?? null);
                  const onTrack = l && target ? l.time_sec <= target : null;
                  return (
                    <tr key={k.key}>
                      <td className="py-1.5">{k.label}</td>
                      <td className={`py-1.5 text-right ${onTrack === null ? "" : onTrack ? "text-emerald-400" : "text-amber-400"}`}>
                        {l ? fmtTime(l.time_sec) : "--"}
                      </td>
                      <td className="py-1.5 text-right text-zinc-400">{best.has(k.key) ? fmtTime(best.get(k.key)!) : "--"}</td>
                      <td className="py-1.5 text-right text-zinc-500">{target ? fmtTime(target) : "--"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <form action={addBenchmark} className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
              <input type="hidden" name="race_id" value={race.id} />
              <select name="station" className={field} defaultValue="skierg">
                {BENCHMARK_KEYS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Time"><input name="time" placeholder="e.g. 4:45" required className={field} /></Field>
                <input name="effort_date" type="date" defaultValue={today} required className={field} />
              </div>
              <Field label="Notes (optional)"><input name="notes" placeholder="Weight, pace, conditions" className={field} /></Field>
              <button type="submit" className={`${btnGhost} w-full`}>
                Log effort
              </button>
            </form>

            {benchmarks.length > 0 && (
              <ul className="mt-4 divide-y divide-zinc-900 text-sm">
                {benchmarks.slice(0, 12).map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate">
                      {BENCHMARK_KEYS.find((k) => k.key === b.station)?.label ?? b.station}{" "}
                      <span className="text-zinc-500">
                        {formatDay(b.effort_date, { weekday: false })}
                        {b.notes ? ` · ${b.notes}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 tabular-nums">
                      {fmtTime(b.time_sec)}
                      <form action={deleteBenchmark}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="race_id" value={race.id} />
                        <ConfirmButton message="Delete this benchmark? You can undo right after." className="text-zinc-600 active:text-red-400">
                          x
                        </ConfirmButton>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <PlanImporter raceId={race.id} />
    </main>
  );
}

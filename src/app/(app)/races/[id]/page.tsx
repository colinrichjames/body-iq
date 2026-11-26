import { ConfirmButton } from "@/components/confirm-button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { diffDays, formatDay } from "@/lib/dates";
import { BENCHMARK_KEYS, fmtTime, hyroxSplits, isHyrox, STATIONS } from "@/lib/hyrox";
import { raceLabel } from "@/lib/plan";
import { phaseInfo, planStartFrom } from "@/lib/race-phase";
import { raceDayCard } from "@/lib/race-day";
import { benchmarkRows, fmtDelta } from "@/lib/benchmarks";
import { getToday } from "@/lib/today";
import type { HyroxBenchmark, Race } from "@/lib/types";
import { btnGhost, card, field } from "@/components/ui";
import { addBenchmark, deleteBenchmark, deleteRace } from "../actions";
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
  const { data: planRows } = await supabase.from("workouts").select("workout_date,created_at").eq("race_id", id).eq("generated", true).returns<{ workout_date: string; created_at: string }[]>();
  const phase = phaseInfo(race.race_type, race.race_date, today, planStartFrom(planRows ?? []));
  const { data: latestScan } = await supabase.from("body_scans").select("weight_lb").not("weight_lb", "is", null).order("scanned_at", { ascending: false }).limit(1).maybeSingle<{ weight_lb: number }>();
  const dayCard = raceDayCard(race, today, latestScan?.weight_lb ? Number(latestScan.weight_lb) * 0.45359237 : null);
  // Fastest logged effort per station (and the 1 km run): the goal time is split around these.
  const bestBy: Record<string, number> = {};
  for (const b of benchmarks) if (!(b.station in bestBy) || b.time_sec < bestBy[b.station]) bestBy[b.station] = b.time_sec;
  const plan = race.goal_time_sec && hyrox ? hyroxSplits(race.goal_time_sec, bestBy) : null;
  const targetByStation = new Map(plan?.splits.filter((s) => s.key).map((s) => [s.key!, s.sec]));
  const runTarget = plan ? plan.runSec / 8 : null;

  const targets = new Map<string, number | null>(BENCHMARK_KEYS.map((k) => [k.key, k.key === "run_1km" ? runTarget : (targetByStation.get(k.key) ?? null)]));
  const rows = benchmarkRows(BENCHMARK_KEYS.map((k) => k.key), benchmarks, targets);
  // Change against the effort before it, per entry, for the log below.
  const prevOf = new Map<string, number>();
  for (const k of BENCHMARK_KEYS) {
    const own = benchmarks.filter((b) => b.station === k.key);
    own.forEach((b, i) => {
      if (own[i + 1]) prevOf.set(b.id, b.time_sec - own[i + 1].time_sec);
    });
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
        {days >= 0 ? `${days} days to go.` : "Race complete."}
        {race.goal_time_sec ? ` Goal ${fmtTime(race.goal_time_sec)}.` : ""}
      </p>
      {phase && (
        <div className="mt-3 rounded-xl border border-zinc-800 px-3 py-2">
          <p className="text-sm font-medium text-emerald-400">{phase.text}</p>
          <p className="mt-0.5 text-sm text-zinc-400">{phase.blurb}</p>
        </div>
      )}
      <Link href={`/races/${race.id}/plan`} className="mr-2 mt-3 inline-block rounded-xl border border-emerald-500/60 px-3 py-1.5 text-sm text-emerald-300 active:bg-emerald-500/10">
        Training plan
      </Link>
      <Link href={`/races/${race.id}/edit`} className="mt-3 inline-block rounded-xl border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 active:bg-zinc-800">
        Edit race
      </Link>
      <form action={deleteRace} className="ml-2 mt-3 inline-block">
        <input type="hidden" name="id" value={race.id} />
        <ConfirmButton message={`Delete ${race.name}? Its unfinished planned sessions are deleted too; completed workouts stay. You can undo right after.`} className="rounded-xl border border-zinc-800 px-3 py-1.5 text-sm text-zinc-400 active:text-red-400">
          Delete
        </ConfirmButton>
      </form>
      {dayCard && (
        <section className={`${card} mt-4 border-emerald-900`} aria-label="Race day plan">
          <h2 className="font-medium text-emerald-400">{dayCard.heading}</h2>
          {[
            ["Pacing", dayCard.pacing],
            ["Fuel and fluids during", dayCard.fuel],
            ["Eating before", dayCard.before],
          ].map(([title, lines]) => (
            <div key={title as string} className="mt-3">
              <h3 className="text-xs uppercase tracking-wider text-zinc-500">{title as string}</h3>
              <ul className="mt-1 space-y-1 text-sm text-zinc-300">
                {(lines as string[]).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
          <div className="mt-3">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500">Pack and check</h3>
            <ul className="mt-1 space-y-1 text-sm text-zinc-300">
              {dayCard.checklist.map((l) => (
                <li key={l} className="flex gap-2">
                  <span aria-hidden className="text-zinc-600">&#9633;</span>
                  {l}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
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
                    {plan.splits.map((s, i) => {
                      const mine = s.kind === "station" ? bestBy[s.key!] : bestBy.run_1km;
                      return (
                        <tr key={i} className={s.kind === "run" ? "text-zinc-400" : ""}>
                          <td className="py-1.5">{s.label}</td>
                          <td className="py-1.5 text-right text-zinc-500">
                            {s.kind === "station" ? STATIONS.find((x) => x.key === s.key)?.work : "1 km"}
                          </td>
                          <td className="py-1.5 text-right text-zinc-500" title="Your fastest logged effort">{mine ? `best ${fmtTime(mine)}` : "--"}</td>
                          <td className="py-1.5 text-right font-medium">{fmtTime(s.sec)}</td>
                        </tr>
                      );
                    })}
                    <tr className="text-zinc-400">
                      <td className="py-1.5">Roxzone (all transitions)</td>
                      <td />
                      <td />
                      <td className="py-1.5 text-right">{fmtTime(plan.roxzoneSec)}</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 font-medium">Total</td>
                      <td />
                      <td />
                      <td className="py-1.5 text-right font-medium">{fmtTime(race.goal_time_sec!)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-zinc-500">
                  {Object.keys(bestBy).length
                    ? "Split around your logged benchmark times: slower stations get more of the goal, stronger ones less. Stations with no time logged use the default share."
                    : "Starting split: 50% running, 6% Roxzone, the rest weighted across stations. These are rules of thumb."}{" "}
                  <a href="#benchmarks" className="text-emerald-400">
                    {Object.keys(bestBy).length ? "Log another effort" : "Log your station times"}
                  </a>{" "}
                  to personalise it.
                </p>
              </>
            )}
          </section>

          <section id="benchmarks" className={`${card} mt-4 scroll-mt-4`}>
            <h2 className="font-medium">Station benchmarks</h2>
            <table className="mt-3 w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-zinc-500">
                <tr>
                  <th className="py-1 font-normal">Station</th>
                  <th className="py-1 text-right font-normal">Latest</th>
                  <th className="py-1 text-right font-normal">vs last</th>
                  <th className="py-1 text-right font-normal">vs target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {rows.map((r) => {
                  const label = BENCHMARK_KEYS.find((k) => k.key === r.key)?.label;
                  const tone = (n: number | null) => (n === null || Math.abs(n) < 1 ? "text-zinc-500" : n < 0 ? "text-emerald-400" : "text-amber-400");
                  return (
                    <tr key={r.key}>
                      <td className="py-1.5">
                        {label}
                        <span className="block text-xs text-zinc-500">
                          {r.target ? `target ${fmtTime(r.target)}` : "no target"}
                          {r.best !== null ? ` · best ${fmtTime(r.best)}` : ""}
                        </span>
                      </td>
                      <td className={`py-1.5 text-right ${r.vsTarget === null ? "" : r.vsTarget <= 0 ? "text-emerald-400" : "text-amber-400"}`}>{r.latest ? fmtTime(r.latest.time_sec) : "--"}</td>
                      <td className={`py-1.5 text-right ${tone(r.vsPrevious)}`}>{r.vsPrevious === null ? "--" : fmtDelta(r.vsPrevious)}</td>
                      <td className={`py-1.5 text-right ${tone(r.vsTarget)}`}>{r.vsTarget === null ? "--" : fmtDelta(r.vsTarget)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-zinc-500">Green is faster, amber is slower. &quot;vs last&quot; compares with your previous effort at that station.</p>

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
                      {prevOf.has(b.id) && (
                        <span className={`text-xs ${Math.abs(prevOf.get(b.id)!) < 1 ? "text-zinc-500" : prevOf.get(b.id)! < 0 ? "text-emerald-400" : "text-amber-400"}`}>{fmtDelta(prevOf.get(b.id)!)}</span>
                      )}
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

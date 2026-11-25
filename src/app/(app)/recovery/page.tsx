import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDay } from "@/lib/dates";
import { computeReadiness } from "@/lib/readiness";
import { explainDay, loadBand, toneClass } from "@/lib/recovery";
import { card } from "@/components/ui";
import type { DailyHealth } from "@/lib/types";

type Activity = {
  id: string;
  sport: string | null;
  title: string | null;
  started_at: string;
  duration_sec: number | null;
  distance_m: number | null;
  avg_hr: number | null;
  training_load: number | null;
};

const mins = (s: number | null) => (s === null ? "" : `${Math.round(s / 60)} min`);

export default async function RecoveryPage() {
  const { supabase } = await requireUser();
  const [healthRes, actRes] = await Promise.all([
    supabase.from("daily_health").select("*").order("day", { ascending: false }).limit(14).returns<DailyHealth[]>(),
    supabase
      .from("activities")
      .select("id,sport,title,started_at,duration_sec,distance_m,avg_hr,training_load")
      .order("started_at", { ascending: false })
      .limit(20)
      .returns<Activity[]>(),
  ]);
  const rows = healthRes.data ?? [];
  const acts = actRes.data ?? [];
  const readiness = computeReadiness(rows);

  return (
    <main className="mx-auto max-w-md px-5 pb-28 pt-8">
      <h1 className="text-2xl font-semibold">Recovery</h1>
      <p className="mt-1 text-sm text-zinc-400">Your Garmin numbers, scored against your own 7-day baseline.</p>

      {rows.length === 0 ? (
        <section className={`mt-5 ${card}`}>
          <p className="text-sm text-zinc-400">No Garmin data yet.</p>
          <Link href="/connect" className="mt-2 inline-block text-sm text-emerald-400">
            Connect Garmin and sync
          </Link>
        </section>
      ) : (
        <>
          {readiness && (
            <section className={`mt-5 ${card}`}>
              <p className={`font-medium ${readiness.status === "green" ? "text-emerald-400" : readiness.status === "amber" ? "text-amber-400" : "text-red-400"}`}>
                {readiness.headline}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{formatDay(readiness.day)}. Each flag below adds points: 0-1 green, 2-3 amber, 4+ red.</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
                {readiness.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          )}

          <h2 className="mt-6 text-sm text-zinc-400">Day by day</h2>
          <div className="mt-2 space-y-3">
            {rows.map((day, i) => (
              <details key={day.day} open={i === 0} className={card}>
                <summary className="cursor-pointer text-sm font-medium">{formatDay(day.day)}</summary>
                <ul className="mt-3 space-y-3">
                  {explainDay(day, rows.slice(i + 1)).map((m) => (
                    <li key={m.key}>
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="text-zinc-400">{m.label}</span>
                        <span className={toneClass[m.tone]}>{m.value}</span>
                      </div>
                      <p className="text-xs text-zinc-500">{m.meaning}</p>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>

          <h2 className="mt-6 text-sm text-zinc-400">Recent activities</h2>
          <p className="text-xs text-zinc-500">Training load is Garmin&apos;s effort score: under 40 light, 40-89 moderate, 90-149 hard, 150+ very hard.</p>
          <ul className="mt-2 space-y-2">
            {acts.length === 0 && <li className="text-sm text-zinc-500">No activities synced.</li>}
            {acts.map((a) => {
              const band = loadBand(a.training_load);
              return (
                <li key={a.id} className={card}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span>{a.title || a.sport || "Activity"}</span>
                    <span className={toneClass[band.tone]}>
                      {a.training_load !== null ? `${Math.round(a.training_load)} · ${band.label}` : band.label}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {formatDay(a.started_at.slice(0, 10))}
                    {a.duration_sec ? ` · ${mins(a.duration_sec)}` : ""}
                    {a.distance_m ? ` · ${(a.distance_m / 1609.34).toFixed(1)} mi` : ""}
                    {a.avg_hr ? ` · avg ${a.avg_hr} bpm` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}

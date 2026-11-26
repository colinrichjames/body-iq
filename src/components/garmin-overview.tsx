import Link from "next/link";
import { formatDistance, formatDuration, KIND_ICON, kindOf, paceOrSpeed, plural, stepWeek, STEP_GOAL, todaysActivities, weekTotals, type Act, type Units } from "@/lib/garmin-summary";
import type { DailyHealth } from "@/lib/types";

const tile = "rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4";

function Ring({ value, goal }: { value: number; goal: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / goal));
  return (
    <svg viewBox="0 0 100 100" className="mx-auto h-28 w-28" role="img" aria-label={`${value.toLocaleString("en-US")} of ${goal.toLocaleString("en-US")} steps`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-zinc-800" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${pct * c} ${c}`} transform="rotate(-90 50 50)" className="text-sky-400" />
      <text x="50" y="55" textAnchor="middle" className="fill-zinc-100 text-[18px] font-semibold">
        {value.toLocaleString("en-US")}
      </text>
    </svg>
  );
}

const hm = (sec: number) => `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;

/** Garmin-style Home sections: today's activities, a few daily stats, and the last 7 days by activity type. */
export function GarminOverview({ activities, health, today, tz, units }: { activities: Act[]; health: DailyHealth[]; today: string; tz: string; units: Units }) {
  const todays = todaysActivities(activities, today, tz);
  const week = weekTotals(activities, units);
  const todayHealth = health.find((h) => h.day === today) ?? null;
  const latest = todayHealth ?? health[0] ?? null;
  const days = stepWeek(health.map((h) => ({ day: h.day, steps: h.steps })), today);
  const steps = todayHealth?.steps ?? 0;
  if (!todays.length && !week.length && !latest) return null;

  return (
    <>
      <section className="mt-6" aria-label="Today's activity">
        <h2 className="text-lg font-semibold">Today&apos;s Activity</h2>
        {todays.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-zinc-800 p-4 text-sm text-zinc-500">No activity yet today. Tap Sync now after a workout.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {todays.map((a) => {
              const kind = kindOf(a.sport);
              const dist = formatDistance(a.distance_m, units);
              const pace = paceOrSpeed(kind, a, units);
              return (
                <li key={a.id} className={tile}>
                  <p className="text-sm text-zinc-400">{a.title?.trim() || kind}</p>
                  <div className="mt-2 flex items-center gap-4">
                    <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-2xl">
                      {KIND_ICON[kind]}
                    </span>
                    <div>
                      <p className="text-2xl font-semibold tabular-nums">{dist ?? formatDuration(a.duration_sec)}</p>
                      {dist && <p className="text-sm text-zinc-400 tabular-nums">{formatDuration(a.duration_sec)}</p>}
                      {pace && <p className="text-sm text-zinc-400 tabular-nums">{pace}</p>}
                      {!dist && a.avg_hr ? <p className="text-sm text-zinc-400 tabular-nums">{a.avg_hr} bpm avg</p> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {latest && (
        <section className="mt-6" aria-label="At a glance">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">At a Glance</h2>
            <Link href="/recovery" className="text-sm text-emerald-400">
              See all
            </Link>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {todayHealth?.steps !== null && todayHealth?.steps !== undefined && (
              <div className={tile}>
                <p className="text-sm text-zinc-400">Steps</p>
                <Ring value={steps} goal={STEP_GOAL} />
                <p className="text-center text-xs text-zinc-500">Goal {STEP_GOAL.toLocaleString("en-US")}</p>
                <ul className="mt-3 flex justify-between border-t border-zinc-800 pt-3 text-xs" aria-label="Last 7 days">
                  {days.map((d) => (
                    <li key={d.day} className={`flex flex-col items-center gap-0.5 ${d.isToday ? "font-bold text-zinc-100" : "text-zinc-500"}`}>
                      <span>{d.letter}</span>
                      <span aria-label={d.met ? "goal met" : "goal not met"} className={d.met ? "text-emerald-400" : "text-transparent"}>
                        ✓
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {latest.resting_hr !== null && (
              <div className={tile}>
                <p className="text-sm text-zinc-400">Resting heart rate</p>
                <p className="mt-3 text-3xl font-semibold tabular-nums">{latest.resting_hr}</p>
                <p className="text-sm text-zinc-500">bpm</p>
              </div>
            )}
            {latest.sleep_seconds !== null && (
              <div className={tile}>
                <p className="text-sm text-zinc-400">Sleep</p>
                <p className="mt-3 text-3xl font-semibold tabular-nums">{hm(latest.sleep_seconds)}</p>
                {latest.sleep_score !== null && <p className="text-sm text-zinc-500">Score {latest.sleep_score}</p>}
              </div>
            )}
            {latest.body_battery_max !== null && (
              <div className={tile}>
                <p className="text-sm text-zinc-400">Body Battery</p>
                <p className="mt-3 text-3xl font-semibold tabular-nums">{latest.body_battery_max}</p>
                {latest.body_battery_min !== null && <p className="text-sm text-zinc-500">Low {latest.body_battery_min}</p>}
              </div>
            )}
            {latest.hrv_ms !== null && (
              <div className={tile}>
                <p className="text-sm text-zinc-400">HRV</p>
                <p className="mt-3 text-3xl font-semibold tabular-nums">{Math.round(latest.hrv_ms)}</p>
                <p className="text-sm text-zinc-500">ms overnight</p>
              </div>
            )}
            {latest.stress_avg !== null && (
              <div className={tile}>
                <p className="text-sm text-zinc-400">Stress</p>
                <p className="mt-3 text-3xl font-semibold tabular-nums">{latest.stress_avg}</p>
                <p className="text-sm text-zinc-500">average</p>
              </div>
            )}
          </div>
        </section>
      )}

      {week.length > 0 && (
        <section className="mt-6" aria-label="Last 7 days">
          <h2 className="text-lg font-semibold">Last 7 Days</h2>
          <ul className="mt-2 divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
            {week.map((w) => (
              <li key={w.kind} className="flex items-center gap-4 px-4 py-4">
                <span aria-hidden="true" className="w-8 text-center text-2xl">
                  {KIND_ICON[w.kind]}
                </span>
                <span className="flex-1 font-medium">
                  {w.count} {plural(w.kind, w.count)}
                </span>
                <span className="tabular-nums text-zinc-300">{w.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

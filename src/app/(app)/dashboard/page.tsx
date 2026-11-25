import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { addDays, diffDays, formatDay } from "@/lib/dates";
import { computeInsights } from "@/lib/insights";
import { currentPhase, raceLabel } from "@/lib/plan";
import { getToday } from "@/lib/today";
import { computeReadiness } from "@/lib/readiness";
import { targetsFor } from "@/lib/targets";
import type { BodyScan, DailyHealth, NutritionDay, Profile, Race, SyncRun, Workout } from "@/lib/types";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

function delta(latest: number | null, previous: number | null, digits = 1) {
  if (latest === null || previous === null) return null;
  return Number((latest - previous).toFixed(digits));
}

export default async function DashboardPage() {
  const { supabase, userId, email } = await requireUser();
  const today = await getToday();

  const [scansRes, workoutsRes, nutritionRes, profileRes, racesRes, healthRes, syncRes] = await Promise.all([
    supabase.from("body_scans").select("*").order("scanned_at", { ascending: false }).limit(2).returns<BodyScan[]>(),
    supabase.from("workouts").select("*").gte("workout_date", addDays(today, -27)).lte("workout_date", addDays(today, 1)).returns<Workout[]>(),
    supabase.from("nutrition_days").select("*").gte("day", addDays(today, -13)).order("day", { ascending: false }).returns<NutritionDay[]>(),
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>(),
    supabase.from("races").select("*").gte("race_date", today).order("race_date").limit(1).returns<Race[]>(),
    supabase.from("daily_health").select("*").order("day", { ascending: false }).limit(8).returns<DailyHealth[]>(),
    supabase.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(1).returns<SyncRun[]>(),
  ]);
  const scans = scansRes.data ?? [];
  const [latest, previous] = scans;
  const workouts = workoutsRes.data ?? [];
  const nextRace = racesRes.data?.[0] ?? null;
  const todays = workouts.filter((w) => w.workout_date === today);
  const readiness = computeReadiness(healthRes.data ?? []);
  const lastSync = syncRes.data?.[0] ?? null;
  const todayFuel = (nutritionRes.data ?? []).find((d) => d.day === today) ?? null;
  const fuelTargets = targetsFor(today, workouts, profileRes.data ?? null);
  const insights = computeInsights({
    today,
    scans,
    workouts,
    nutrition: nutritionRes.data ?? [],
    profile: profileRes.data ?? null,
    nextRace,
  });

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">Body IQ</p>
          <p className="mt-1 truncate text-sm text-zinc-500">{email}</p>
        </div>
        <form action={signOut}>
          <button type="submit" className="text-sm text-zinc-400 active:text-zinc-200">
            Sign out
          </button>
        </form>
      </header>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-sm text-zinc-400">Today &middot; {formatDay(today)}</h2>
        {todays.length === 0 ? (
          <p className="mt-2 text-zinc-300">Nothing planned. Rest day, or add a workout.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {todays.map((w) => (
              <li key={w.id}>
                <Link href={`/workouts/${w.id}`} className="flex items-center justify-between gap-3">
                  <span className={w.status === "completed" ? "text-zinc-500 line-through" : "font-medium"}>{w.title}</span>
                  <span className="text-sm text-emerald-400">{w.status === "completed" ? "Done" : "Open"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-zinc-800 p-5">
        <h2 className="text-sm text-zinc-400">Fuel today</h2>
        {todayFuel && (todayFuel.calories ?? 0) > 0 ? (
          <p className="mt-2 tabular-nums">
            <span className="text-2xl font-semibold">{Math.round(todayFuel.calories ?? 0)}</span>
            <span className="text-zinc-500"> / {fuelTargets.calories ?? "--"} cal</span>
            <span className="ml-3 text-sm text-zinc-400">
              P {Math.round(todayFuel.protein_g ?? 0)}/{fuelTargets.protein ?? "--"}
            </span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">
            Nothing logged for today. Target {fuelTargets.calories ? `${fuelTargets.calories} cal` : "not set"}.{" "}
            <Link href="/nutrition" className="text-emerald-400">
              Add
            </Link>
          </p>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-zinc-800 p-5">
        <h2 className="text-sm text-zinc-400">Readiness</h2>
        {readiness ? (
          <>
            <p
              className={`mt-2 font-medium ${readiness.status === "green" ? "text-emerald-400" : readiness.status === "amber" ? "text-amber-400" : "text-red-400"}`}
            >
              {readiness.headline}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
              {readiness.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-zinc-500">
              Based on {formatDay(readiness.day)}. Rules: sleep, HRV vs 7-day baseline, resting HR, Body Battery, stress.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No Garmin health data yet. Sleep, HRV and Body Battery will drive a green/amber/red call here once sync is connected.</p>
        )}
        <p className="mt-3 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
          Garmin sync:{" "}
          {lastSync
            ? `${lastSync.status === "success" ? "last success" : lastSync.status} ${new Date(lastSync.finished_at ?? lastSync.started_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${lastSync.error ? `, ${lastSync.error}` : ""}`
            : "not connected yet"}{" "}
          {!lastSync && (
            <Link href="/connect" className="text-emerald-400">
              Connect
            </Link>
          )}
        </p>
      </section>

      {nextRace && (
        <Link href="/races" className="mt-4 flex items-center justify-between rounded-2xl border border-zinc-800 p-5">
          <div>
            <p className="text-sm text-zinc-400">Next race</p>
            <p className="mt-1 font-medium">{nextRace.name}</p>
            <p className="text-sm text-zinc-500">
              {raceLabel(nextRace.race_type)} &middot; {currentPhase(nextRace.race_type, nextRace.race_date, today) ?? "race"} phase
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tabular-nums text-emerald-400">{diffDays(today, nextRace.race_date)}</p>
            <p className="text-xs text-zinc-500">days</p>
          </div>
        </Link>
      )}

      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-sm text-zinc-400">Health score</h2>
        <p className={`mt-2 text-4xl font-semibold tabular-nums ${insights.score === null ? "text-zinc-600" : ""}`}>
          {insights.score ?? "--"}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {insights.score === null ? "Not enough data yet." : `Based on ${insights.available} of 5 categories.`}
        </p>
        <ul className="mt-4 space-y-2">
          {insights.categories.map((c) => (
            <li key={c.key} className="text-sm">
              <div className="flex justify-between">
                <span className={c.score === null ? "text-zinc-500" : ""}>{c.label}</span>
                <span className="tabular-nums text-zinc-400">{c.score === null ? "--" : `${c.score} / ${c.max}`}</span>
              </div>
              <p className="text-xs text-zinc-500">{c.note}</p>
            </li>
          ))}
        </ul>
        {insights.bullets.length > 0 && (
          <ul className="mt-4 list-disc space-y-1 border-t border-zinc-800 pl-5 pt-4 text-sm text-zinc-300">
            {insights.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-zinc-800 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm text-zinc-400">Latest body scan</h2>
          <Link href="/scans" className="text-sm text-emerald-400">
            {latest ? "All scans" : "Log one"}
          </Link>
        </div>

        {latest ? (
          <>
            <p className="mt-1 text-xs text-zinc-500">
              {new Date(latest.scanned_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}{" "}
              &middot; {latest.source}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Metric
                label="Weight"
                value={latest.weight_lb}
                suffix=" lb"
                change={delta(latest.weight_lb, previous?.weight_lb ?? null)}
              />
              <Metric
                label="Body fat"
                value={latest.body_fat_pct}
                suffix="%"
                change={delta(latest.body_fat_pct, previous?.body_fat_pct ?? null)}
                lowerIsBetter
              />
              <Metric
                label="Muscle"
                value={latest.skeletal_muscle_lb}
                suffix=" lb"
                change={delta(latest.skeletal_muscle_lb, previous?.skeletal_muscle_lb ?? null)}
              />
            </div>
            {previous && <p className="mt-3 text-xs text-zinc-500">Change vs. previous scan.</p>}
          </>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No scans yet. Add your first InBody result to start tracking.</p>
        )}
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  suffix,
  change,
  lowerIsBetter = false,
}: {
  label: string;
  value: number | null;
  suffix: string;
  change: number | null;
  lowerIsBetter?: boolean;
}) {
  const good = change === null || change === 0 ? null : lowerIsBetter ? change < 0 : change > 0;
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value === null ? "--" : `${value}${suffix}`}</p>
      {change !== null && change !== 0 && (
        <p className={`text-xs tabular-nums ${label === "Weight" ? "text-zinc-400" : good ? "text-emerald-400" : "text-amber-400"}`}>
          {change > 0 ? "+" : ""}
          {change}
        </p>
      )}
    </div>
  );
}

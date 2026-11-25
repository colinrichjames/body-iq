import { ConfirmButton } from "@/components/confirm-button";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { addDays, diffDays, formatDay } from "@/lib/dates";
import { computeInsights, SCORE_NAME } from "@/lib/insights";
import { currentPhase, raceLabel } from "@/lib/plan";
import { getToday } from "@/lib/today";
import { computeReadiness } from "@/lib/readiness";
import { fuelForDay } from "@/lib/fuel";
import { classify } from "@/lib/intensity";
import { swapHardSession } from "../workouts/actions";
import { saveGuestAccount } from "./guest-actions";
import { targetsFor } from "@/lib/targets";
import type { BodyScan, DailyHealth, NutritionDay, Profile, Race, SyncRun, Workout } from "@/lib/types";

async function signOut() {
  "use server";
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  // A guest leaving takes their data with them.
  if (data?.claims?.is_anonymous === true) {
    const { error } = await supabase.rpc("delete_guest_self");
    if (error) redirect(`/dashboard?notice=${encodeURIComponent("Couldn't clear your guest data, so you're still signed in. Try again.")}`);
  }
  await supabase.auth.signOut();
  redirect("/login");
}

function delta(latest: number | null, previous: number | null, digits = 1) {
  if (latest === null || previous === null) return null;
  return Number((latest - previous).toFixed(digits));
}

export default async function DashboardPage() {
  const { supabase, userId, email, isGuest } = await requireUser();
  const today = await getToday();

  const [scansRes, workoutsRes, nutritionRes, profileRes, racesRes, healthRes, syncRes] = await Promise.all([
    supabase.from("body_scans").select("*").order("scanned_at", { ascending: false }).limit(2).returns<BodyScan[]>(),
    supabase.from("workouts").select("*").gte("workout_date", addDays(today, -27)).lte("workout_date", addDays(today, 1)).returns<Workout[]>(),
    supabase.from("nutrition_days").select("*").gte("day", addDays(today, -13)).order("day", { ascending: false }).returns<NutritionDay[]>(),
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>(),
    supabase.from("races").select("*").gte("race_date", today).order("race_date").limit(1).returns<Race[]>(),
    supabase.from("daily_health").select("*").order("day", { ascending: false }).limit(14).returns<DailyHealth[]>(),
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
  const weightKg = latest?.weight_lb ? latest.weight_lb * 0.45359237 : null;
  const dayFuel = fuelForDay(today, workouts, weightKg, nextRace?.race_date ?? null, nextRace?.race_type ?? null);
  const hardToday = todays.find((w) => w.status === "planned" && classify(w).level === "hard") ?? null;
  const swapNeeded = readiness && readiness.status !== "green" && hardToday ? hardToday : null;
  const insights = computeInsights({
    today,
    scans,
    workouts,
    nutrition: nutritionRes.data ?? [],
    health: healthRes.data ?? [],
    profile: profileRes.data ?? null,
    nextRace,
  });

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">Body IQ</p>
          <p className="mt-1 truncate text-sm text-zinc-500">{isGuest ? "Guest" : email}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/settings" className="text-sm text-zinc-400 active:text-zinc-200">
            Settings
          </Link>
          <form action={signOut}>
            {isGuest ? (
              <ConfirmButton message="Leave the guest session? Everything you entered as a guest is deleted and can't be restored." className="text-sm text-zinc-400 active:text-zinc-200">
                Leave guest session
              </ConfirmButton>
            ) : (
              <button type="submit" className="text-sm text-zinc-400 active:text-zinc-200">
                Sign out
              </button>
            )}
          </form>
        </div>
      </header>

      {isGuest && (
        <section className="mt-4 rounded-2xl border border-amber-700/50 bg-amber-950/20 p-4">
          <p className="text-sm font-medium text-amber-300">You&apos;re using a guest session</p>
          <p className="mt-1 text-xs text-zinc-400">
            Everything works, but nothing is kept. Guest data is deleted when you tap Leave guest session, or automatically 24 hours after you start, whichever comes first. Add an email below to keep it.
          </p>
          <form action={saveGuestAccount} className="mt-3 flex gap-2">
            <input
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-base outline-none placeholder:text-zinc-600 focus:border-emerald-500"
            />
            <button type="submit" className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2.5 font-medium text-zinc-950 active:bg-emerald-400">
              Save
            </button>
          </form>
        </section>
      )}


      {swapNeeded && readiness && (
        <section className="mt-6 rounded-2xl border border-amber-900 bg-amber-950/30 p-5 text-sm">
          <p className="font-medium text-amber-300">
            {readiness.status === "red" ? "You're under-recovered" : "Recovery is mixed"}, and today is a hard session.
          </p>
          <p className="mt-1 text-zinc-300">&quot;{swapNeeded.title}&quot; can move to the next day without a hard session.</p>
          <form action={swapHardSession} className="mt-3">
            <input type="hidden" name="id" value={swapNeeded.id} />
            <button type="submit" className="rounded-xl bg-amber-400 px-4 py-2 font-medium text-zinc-950 active:bg-amber-300">
              Move it
            </button>
          </form>
        </section>
      )}

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
                  <span className={`text-sm ${w.status === "in_progress" ? "text-amber-400" : "text-emerald-400"}`}>{w.status === "completed" ? "Done" : w.status === "in_progress" ? "In progress" : "Open"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-zinc-800 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm text-zinc-400">Fuel today</h2>
          <span className="text-xs text-emerald-400">{dayFuel.label}</span>
        </div>
        {todayFuel && (todayFuel.calories ?? 0) > 0 ? (
          <p className="mt-2 tabular-nums">
            <span className="text-2xl font-semibold">{Math.round(todayFuel.calories ?? 0)}</span>
            <span className="text-zinc-500"> / {fuelTargets.calories ?? "--"} cal</span>
            <span className="ml-3 text-sm text-zinc-400">
              P {Math.round(todayFuel.protein_g ?? 0)}/{fuelTargets.protein ?? "--"} &middot; C {Math.round(todayFuel.carbs_g ?? 0)}/{fuelTargets.carbs ?? "--"}
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
        <p className="mt-3 text-xs text-zinc-500">
          Carbs scale with the day&apos;s work: {dayFuel.carbsPerKg[0]}-{dayFuel.carbsPerKg[1]} g/kg
          {dayFuel.carbsG ? ` (about ${dayFuel.carbsG[0]}-${dayFuel.carbsG[1]} g)` : " (log a body scan to see grams)"}, protein {dayFuel.proteinPerKg[0]}-{dayFuel.proteinPerKg[1]} g/kg
          {dayFuel.proteinG ? ` (${dayFuel.proteinG[0]}-${dayFuel.proteinG[1]} g)` : ""}. That is a performance range. If you&apos;re cutting, your own targets above take priority; use the day type to shift carbs up or down.
        </p>
        {dayFuel.note && <p className="mt-2 text-xs text-zinc-400">{dayFuel.note}</p>}
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
              Based on {formatDay(readiness.day)}. Rules: sleep, HRV vs 7-day baseline, resting HR, Body Battery, stress.{" "}
              <Link href="/recovery" className="text-emerald-400">
                See the full breakdown
              </Link>
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
        <h2 className="text-sm text-zinc-400">{SCORE_NAME}</h2>
        <p className={`mt-2 text-4xl font-semibold tabular-nums ${insights.score === null ? "text-zinc-600" : ""}`}>
          {insights.score ?? "--"}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {insights.score === null ? "Not enough data yet. See what each part needs below." : `Based on ${insights.available} of 5 categories. Recalculated every time you open this page.`}
        </p>
        <ul className="mt-4 space-y-2">
          {insights.categories.map((c) => (
            <li key={c.key} className="text-sm">
              <div className="flex justify-between">
                <span className={c.score === null ? "text-zinc-500" : ""}>{c.label}</span>
                <span className="tabular-nums text-zinc-400">{c.score === null ? "--" : `${c.score} / ${c.max}`}</span>
              </div>
              <p className="text-xs text-zinc-500">{c.note}</p>
              {c.missing && <p className="text-xs text-amber-400">Missing: {c.missing}</p>}
            </li>
          ))}
        </ul>
        <details className="mt-4 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
          <summary className="cursor-pointer text-sm text-emerald-400">How the {SCORE_NAME} works</summary>
          <p className="mt-2">
            Each category earns points up to its maximum (Nutrition 20, Training 25, Recovery 25, Body composition 20, Activity 10). The score is points earned ÷ points possible, over
            the categories that have enough data, as a number from 0 to 100. A category with no data is left out, not counted as zero, so adding data can move the score either way.
          </p>
          <ul className="mt-2 space-y-2">
            {insights.categories.map((c) => (
              <li key={c.key}>
                <span className="text-zinc-200">{c.label} ({c.max}):</span> {c.rule}
              </li>
            ))}
          </ul>
        </details>
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

      <p className="mt-6 text-center text-xs text-zinc-600">
        <a href="/export" className="underline">
          Export all my data (JSON)
        </a>
        {" · "}
        <a href="/export?type=workouts" className="underline">
          Workouts
        </a>
        {" · "}
        <a href="/export?type=sets" className="underline">
          Sets
        </a>
        {" · "}
        <a href="/export?type=food" className="underline">
          Food
        </a>
        {" · "}
        <a href="/export?type=activities" className="underline">
          Garmin
        </a>
        {" (CSV)"}
      </p>
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

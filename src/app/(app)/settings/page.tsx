import Link from "next/link";
import { requireUser } from "@/lib/auth";
import type { Profile } from "@/lib/types";
import { btnPrimary, card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { saveUnits } from "./actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const { supabase, userId, email, isGuest } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>();
  const unit = profile?.unit_system ?? "imperial";

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href="/profile" className="text-sm text-zinc-400">
        &larr; Profile
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Settings</h1>
      {saved && <p className="mt-4 rounded-xl border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">Saved.</p>}
      {error && <p className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}

      <form action={saveUnits} className={`${card} mt-5 space-y-3`}>
        <h2 className="font-medium">Units</h2>
        <label className="flex items-center gap-3 text-sm">
          <input type="radio" name="unit_system" value="imperial" defaultChecked={unit === "imperial"} />
          Imperial: miles, pounds
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="radio" name="unit_system" value="metric" defaultChecked={unit === "metric"} />
          Metric: kilometers, kilograms
        </label>
        <p className="text-xs text-zinc-500">
          Sets the default distance unit when you add a workout. Body scans and strength weights are still recorded in pounds, and nutrition targets in grams and calories.
        </p>
        <SubmitButton className={`${btnPrimary} w-full`}>Save units</SubmitButton>
      </form>

      <section className={`${card} mt-5`}>
        <h2 className="font-medium">Account</h2>
        <p className="mt-1 text-sm text-zinc-400">{isGuest ? "Guest session. Add an email on the dashboard to keep your data." : email}</p>
      </section>

      <section className={`${card} mt-5`}>
        <h2 className="font-medium">Privacy</h2>
        <p className="mt-1 text-sm text-zinc-400">What Body IQ stores, who can see it, and what leaves the app.</p>
        <Link href="/privacy" className="mt-2 inline-block text-sm text-emerald-400 underline">
          Read the privacy page
        </Link>
      </section>

      <section className={`${card} mt-5`}>
        <h2 className="font-medium">Reminders</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Body IQ can&apos;t send alerts while it&apos;s closed. Your calendar can: download your planned sessions and races, and each session gets an alert at the time you pick. Re-download after you rebuild a plan; sessions update rather than duplicate.
        </p>
        <form action="/export" method="get" className="mt-3 flex items-end gap-3">
          <input type="hidden" name="type" value="calendar" />
          <label className="flex-1 text-sm text-zinc-400">
            Alert time
            <input type="time" name="time" defaultValue="07:00" required className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-base outline-none focus:border-emerald-500" />
          </label>
          <button type="submit" className={btnPrimary}>
            Get calendar file
          </button>
        </form>
        <p className="mt-2 text-xs text-zinc-500">The home screen also reminds you when a session is in progress, when nothing is logged by evening, and when a body scan is two weeks old.</p>
      </section>

      <section className={`${card} mt-5`}>
        <h2 className="font-medium">Install on your phone</h2>
        <p className="mt-1 text-sm text-zinc-400">
          iPhone: open Body IQ in Safari, tap Share, then Add to Home Screen. Android: open the browser menu and choose Install app. It opens full screen, and the workout screen keeps working without signal: sets are kept on your phone and saved when you&apos;re back online.
        </p>
      </section>

      <section className={`${card} mt-5`}>
        <h2 className="font-medium">Your data</h2>
        <p className="mt-1 text-sm text-zinc-400">Download everything Body IQ has stored for you.</p>
        <ul className="mt-2 space-y-1 text-sm">
          <li>
            <a href="/export" className="text-emerald-400 underline">
              Everything (JSON)
            </a>
          </li>
          <li>
            <a href="/export?type=workouts" className="text-emerald-400 underline">
              Workouts (CSV)
            </a>
          </li>
          <li>
            <a href="/export?type=sets" className="text-emerald-400 underline">
              Logged sets (CSV)
            </a>
          </li>
          <li>
            <a href="/export?type=food" className="text-emerald-400 underline">
              Food log (CSV)
            </a>
          </li>
          {[
            ["scans", "Body scans"],
            ["nutrition", "Nutrition days"],
            ["hydration", "Water"],
            ["races", "Races"],
            ["benchmarks", "Hyrox benchmarks"],
            ["activities", "Garmin activities"],
            ["health", "Garmin daily health"],
            ["checkins", "Recovery check-ins"],
            ["weighins", "Weigh-ins"],
          ].map(([t, label]) => (
            <li key={t}>
              <a href={`/export?type=${t}`} className="text-emerald-400 underline">
                {label} (CSV)
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

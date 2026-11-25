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
      <Link href="/dashboard" className="text-sm text-zinc-400">
        &larr; Home
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
        </ul>
      </section>
    </main>
  );
}

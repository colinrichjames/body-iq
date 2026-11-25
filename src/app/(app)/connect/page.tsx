import Link from "next/link";
import { requireUser } from "@/lib/auth";
import type { SyncRun } from "@/lib/types";
import { card } from "@/components/ui";

const KEY_PAGE = "https://connect.garmin.com/app/settings/personalApiToken";

const STEPS = [
  {
    title: "Open Garmin Connect on the web",
    body: (
      <>
        Use a browser, not the Garmin Connect phone app. Open{" "}
        <a href={KEY_PAGE} target="_blank" rel="noreferrer" className="text-emerald-400 underline">
          the Personal API Token page
        </a>{" "}
        and sign in with your Garmin account. If the link doesn&apos;t open the page, go to connect.garmin.com, open your account Settings and look for Personal API Token.
      </>
    ),
  },
  {
    title: "Create a key",
    body: <>Tap Create Key and accept the Terms and Conditions.</>,
  },
  {
    title: "Choose 365 days",
    body: (
      <>
        Set the expiration to <strong className="text-zinc-100">365 days</strong>, the longest option, so you only renew once a year. Garmin emails you about a week before it
        expires. You can delete a key at any time if you think it leaked.
      </>
    ),
  },
  {
    title: "Copy the key right away",
    body: (
      <>
        Garmin shows the key once. Copy it and keep it in a password manager. Treat it like a password: don&apos;t paste it into chat, a note, or a screenshot. If you lose it,
        delete the key and make a new one.
      </>
    ),
  },
  {
    title: "Add it to Body IQ as a secret",
    body: (
      <>
        In Supabase, open your project, then Edge Functions, then Secrets. Add a secret named{" "}
        <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-sm">GARMIN_API_KEY</code> with the key as the value. The key lives only on the server and is never sent to your
        browser.
      </>
    ),
  },
  {
    title: "Link MyFitnessPal to Garmin (optional)",
    body: (
      <>
        In MyFitnessPal, open Apps and Devices and connect Garmin. If your calories then show up in Garmin Connect, Body IQ may be able to read them. This is still being
        confirmed.
      </>
    ),
  },
];

export default async function ConnectPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(1).returns<SyncRun[]>();
  const last = data?.[0] ?? null;

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href="/dashboard" className="text-sm text-zinc-400">
        &larr; Home
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Connect Garmin</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Body IQ reads your own Garmin data with Garmin&apos;s personal API: activities, sleep, HRV, Body Battery, resting heart rate and stress. It only reads. It can&apos;t send
        workouts to your watch.
      </p>

      <section className={`${card} mt-5 text-sm`}>
        <p className="text-zinc-400">Status</p>
        <p className="mt-1">
          {last
            ? `Last sync ${last.status}: ${new Date(last.finished_at ?? last.started_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${last.error ? ` (${last.error})` : ""}`
            : "Not connected yet. Follow the steps below. The sync itself is the next thing to be built."}
        </p>
      </section>

      <ol className="mt-5 space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-medium text-emerald-400">{i + 1}</span>
            <div>
              <p className="font-medium">{s.title}</p>
              <p className="mt-1 text-sm text-zinc-400">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-6 text-xs text-zinc-500">
        Garmin&apos;s key is for personal use on your own data. Body IQ exchanges it for a token that lasts 24 hours, so it requests a fresh one on each sync.
      </p>
    </main>
  );
}

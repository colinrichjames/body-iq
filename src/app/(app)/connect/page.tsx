import { ConfirmButton } from "@/components/confirm-button";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { diffDays, formatDay } from "@/lib/dates";
import { getToday } from "@/lib/today";
import type { SyncRun } from "@/lib/types";
import { btnGhost, btnPrimary, card, field } from "@/components/ui";
import { connectGarmin, disconnectGarmin, syncGarmin } from "./actions";

export const maxDuration = 60;

type Endpoint = { name: string; status: number | string; count?: number };

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
    title: "Paste it below",
    body: <>Paste the key into the form on this page and choose the same expiry you picked in Garmin. Body IQ checks it with Garmin, then stores it on the server. It can&apos;t be shown again and never goes back to your browser.</>,
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

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase } = await requireUser();
  const today = await getToday();
  const { data: conn } = await supabase.from("garmin_connections").select("*").maybeSingle<{ key_last4: string; expires_on: string; verified: boolean }>();
  const daysLeft = conn ? diffDays(today, conn.expires_on) : null;
  const { data } = await supabase.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(1).returns<SyncRun[]>();
  const last = data?.[0] ?? null;
  const endpoints = (last?.detail?.endpoints ?? []) as Endpoint[];

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href="/profile" className="text-sm text-zinc-400">
        &larr; Profile
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Connect Garmin</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Body IQ reads your own Garmin data with Garmin&apos;s personal API: activities, sleep, HRV, Body Battery, resting heart rate and stress. It only reads. It can&apos;t send
        workouts to your watch.
      </p>

      <details className={`${card} mt-4 text-sm`}>
        <summary className="cursor-pointer font-medium">What happens to your Garmin key</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-400">
          <li>It only lets Body IQ read your data. It can&apos;t change your Garmin account or send workouts to your watch.</li>
          <li>It is saved in a table your browser can&apos;t read back, and never shown again after you save it.</li>
          <li>The server uses it only when you tap Sync, to ask Garmin for your data. It isn&apos;t logged.</li>
          <li>It is stored as plain text in that protected table, not separately encrypted. Supabase encrypts the storage underneath.</li>
          <li>Disconnect deletes it from Body IQ immediately. Delete it in Garmin Connect too if you won&apos;t reuse it.</li>
        </ul>
        <Link href="/privacy" className="mt-2 inline-block text-emerald-400 underline">
          Full privacy page
        </Link>
      </details>

      {error && <p className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}

      {conn ? (
        <section className={`${card} mt-5 text-sm`}>
          <p className="font-medium text-emerald-400">Garmin key saved</p>
          <p className="mt-1 text-zinc-400">
            Ends in {conn.key_last4}. {conn.verified ? "Verified with Garmin." : "Not yet verified with Garmin."}
          </p>
          <p className="mt-1 text-zinc-400">
            {last ? `Last used ${formatDay(last.started_at.slice(0, 10), { weekday: false })} when you synced (${last.status}).` : "Not used yet. It is only used when you tap Sync."}
          </p>
          <p className={`mt-1 ${daysLeft !== null && daysLeft <= 14 ? "text-amber-400" : "text-zinc-400"}`}>
            {daysLeft !== null && daysLeft < 0
              ? `Expired ${formatDay(conn.expires_on, { weekday: false, year: true })}. Create a new key and paste it below.`
              : `Expires ${formatDay(conn.expires_on, { weekday: false, year: true })} (${daysLeft} days).`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={syncGarmin}>
              <input type="hidden" name="days" value="7" />
              <button type="submit" className={`${btnPrimary} px-3 py-2 text-sm`}>
                Sync now (7 days)
              </button>
            </form>
            <form action={syncGarmin}>
              <input type="hidden" name="days" value="30" />
              <button type="submit" className={`${btnGhost} px-3 py-2 text-sm`}>
                Load 30 days
              </button>
            </form>
            <form action={disconnectGarmin}>
              <ConfirmButton confirmLabel="Disconnect" message="Disconnect Garmin? Your key is deleted from Body IQ and can't be restored. You'd need to paste it again." className="px-3 py-2 text-sm text-zinc-500 active:text-red-400">
                Disconnect
              </ConfirmButton>
            </form>
          </div>
        </section>
      ) : null}

      <form action={connectGarmin} className={`${card} mt-5 space-y-3`}>
        <h2 className="font-medium">{conn ? "Replace key" : "Add your Garmin key"}</h2>
        <input
          name="api_key"
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-label="Garmin personal API key"
          placeholder="Paste your Garmin personal API key"
          className={field}
        />
        <label className="block text-sm text-zinc-400">
          Expiry you chose in Garmin
          <select name="expiry_days" defaultValue="365" className={`${field} mt-1`}>
            <option value="365">365 days (recommended)</option>
            <option value="180">180 days</option>
            <option value="90">90 days</option>
            <option value="30">30 days</option>
          </select>
        </label>
        <button type="submit" className={`${btnPrimary} w-full`}>
          Save and verify
        </button>
      </form>

      <section className={`${card} mt-5 text-sm`}>
        <p className="text-zinc-400">Status</p>
        <p className="mt-1">
          {last
            ? `Last sync ${last.status}: ${new Date(last.finished_at ?? last.started_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${last.error ? ` (${last.error})` : ""}`
            : "No syncs yet. Save your key, then tap Sync now."}
        </p>
      </section>

      {endpoints.length > 0 && (
        <section className={`${card} mt-5 text-sm`}>
          <p className="text-zinc-400">What Garmin returned on the last sync</p>
          <ul className="mt-2 divide-y divide-zinc-900">
            {endpoints.map((e) => (
              <li key={e.name} className="flex justify-between py-1.5">
                <span>{e.name}</span>
                <span className={`tabular-nums ${e.status === 200 ? "text-zinc-400" : "text-amber-400"}`}>
                  {e.status === 200 ? `${e.count ?? 0} items` : `HTTP ${e.status}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-8 text-sm text-zinc-400">How to get the key</h2>
      <ol className="mt-3 space-y-4">
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

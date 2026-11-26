import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { syncAndImport } from "@/app/(app)/garmin-actions";
import { formatSynced } from "@/lib/garmin-import";
import type { SyncRun } from "@/lib/types";

/** One-tap Garmin refresh with the latest sync time. New activities, like an unplanned walk, are added as workouts. */
export function GarminSyncCard({ connected, last, tz, from }: { connected: boolean; last: SyncRun | null; tz: string; from: "/dashboard" | "/workouts" }) {
  if (!connected) {
    return (
      <Link href="/connect" className="mt-4 flex items-center justify-between rounded-2xl border border-zinc-800 px-4 py-3 text-sm active:bg-zinc-900">
        <span className="text-zinc-300">Connect Garmin to sync workouts and recovery</span>
        <span aria-hidden="true" className="text-zinc-500">&rsaquo;</span>
      </Link>
    );
  }
  const ok = last?.status === "success";
  const when = last ? formatSynced(last.finished_at ?? last.started_at, tz) : null;
  return (
    <section className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">Garmin</p>
        <p className={`truncate text-xs ${last && !ok ? "text-amber-400" : "text-zinc-500"}`}>
          {last ? (ok ? `Last synced ${when}` : `Last sync ${last.status === "running" ? "still running" : "failed"} · ${when}`) : "Not synced yet"}
        </p>
      </div>
      <form action={syncAndImport}>
        <input type="hidden" name="from" value={from} />
        <SubmitButton pendingText="Syncing..." className="rounded-xl border border-emerald-500/60 px-4 py-2 text-sm font-medium text-emerald-300 active:bg-emerald-500/10">
          Sync now
        </SubmitButton>
      </form>
    </section>
  );
}

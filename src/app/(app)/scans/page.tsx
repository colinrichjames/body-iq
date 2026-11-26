import { ConfirmButton } from "@/components/confirm-button";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { BodyScan } from "@/lib/types";
import { TrendChart } from "@/components/trend-chart";
import { fmtChange, lastChange, SCAN_METRICS, trendPoints } from "@/lib/scan-trends";
import { addScan, deleteScan } from "./actions";

const field =
  "w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-base outline-none placeholder:text-zinc-600 focus:border-emerald-500";

export default async function ScansPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("body_scans")
    .select("*")
    .order("scanned_at", { ascending: false })
    .returns<BodyScan[]>();
  const scans = data ?? [];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href="/profile" className="text-sm text-zinc-400">
        &larr; Profile
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Body scans</h1>

      <form action={addScan} className="mt-6 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="font-medium">Log a scan</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-zinc-400">
            Date
            <input name="scanned_at" type="date" defaultValue={today} className={`${field} mt-1`} />
          </label>
          <label className="text-sm text-zinc-400">
            Source
            <select name="source" defaultValue="inbody" className={`${field} mt-1`}>
              <option value="inbody">InBody</option>
              <option value="dexa">DEXA</option>
              <option value="scale">Scale</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <label className="text-sm text-zinc-400">
            Weight (lb)
            <input name="weight_lb" type="number" step="0.1" inputMode="decimal" className={`${field} mt-1`} />
          </label>
          <label className="text-sm text-zinc-400">
            Body fat (%)
            <input name="body_fat_pct" type="number" step="0.1" inputMode="decimal" className={`${field} mt-1`} />
          </label>
          <label className="text-sm text-zinc-400">
            Skeletal muscle (lb)
            <input name="skeletal_muscle_lb" type="number" step="0.1" inputMode="decimal" className={`${field} mt-1`} />
          </label>
          <label className="text-sm text-zinc-400">
            Fat mass (lb)
            <input name="fat_mass_lb" type="number" step="0.1" inputMode="decimal" className={`${field} mt-1`} />
          </label>
        </div>
        <label className="block text-sm text-zinc-400">
          Notes
          <input name="notes" type="text" placeholder="Fasted, morning, post-hydration..." className={`${field} mt-1`} />
        </label>
        <button
          type="submit"
          className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-zinc-950 active:bg-emerald-400"
        >
          Save scan
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
      </form>

      <section className="mt-8 space-y-3" aria-label="Trends">
        <h2 className="font-medium">Trends</h2>
        {scans.length === 0 ? (
          <p className="text-sm text-zinc-500">Charts appear once you log scans.</p>
        ) : (
          <div className="grid gap-3">
            {SCAN_METRICS.map((m) => (
              <TrendChart key={m.key} label={m.label} unit={m.unit} good={m.good} points={trendPoints(scans, m.key)} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-medium">History</h2>
        {scans.length === 0 && (
          <p className="text-sm text-zinc-500">No scans yet. Log your first one above.</p>
        )}
        {scans.map((s, idx) => (
          // History is newest first, so the older neighbour is the previous scan.
          <article key={s.id} className="rounded-2xl border border-zinc-800 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {new Date(s.scanned_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                <p className="text-xs uppercase tracking-wide text-zinc-500">{s.source}</p>
              </div>
              <form action={deleteScan}>
                <input type="hidden" name="id" value={s.id} />
                <ConfirmButton message="Delete this scan? You can undo right after." className="text-sm text-zinc-500 active:text-red-400">
                  Delete
                </ConfirmButton>
              </form>
            </div>
            <dl className="mt-3 grid grid-cols-4 gap-2 text-sm">
              {SCAN_METRICS.map((m) => {
                const prev = scans.slice(idx + 1).find((o) => o[m.key] !== null)?.[m.key] ?? null;
                const cur = s[m.key];
                const change = cur !== null && prev !== null ? lastChange([{ date: "", value: Number(prev) }, { date: "", value: Number(cur) }]) : null;
                return <Stat key={m.key} label={m.key === "skeletal_muscle_lb" ? "Muscle" : m.label} value={cur} unit={m.unit} change={change} good={m.good} />;
              })}
            </dl>
            {s.notes && <p className="mt-3 text-sm text-zinc-400">{s.notes}</p>}
          </article>
        ))}
      </section>
    </main>
  );
}

function Stat({ label, value, unit, change, good }: { label: string; value: number | null; unit: string; change: number | null; good: "down" | "up" | "either" }) {
  const tone = change === null || change === 0 || good === "either" ? "text-zinc-500" : (change < 0) === (good === "down") ? "text-emerald-400" : "text-amber-400";
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-medium tabular-nums">
        {value === null ? "--" : unit === "%" ? `${value}%` : value}
      </dd>
      {value !== null && unit !== "%" && <span className="text-xs text-zinc-500">{unit}</span>}
      {change !== null && change !== 0 && <p className={`text-xs tabular-nums ${tone}`}>{fmtChange(change, unit).replace(" lb", "")}</p>}
    </div>
  );
}

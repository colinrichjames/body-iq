import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { BodyScan } from "@/lib/types";

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
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const email = (claimsData?.claims?.email as string | undefined) ?? "";

  const { data } = await supabase
    .from("body_scans")
    .select("*")
    .order("scanned_at", { ascending: false })
    .limit(2)
    .returns<BodyScan[]>();
  const [latest, previous] = data ?? [];

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

      <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-sm text-zinc-400">Health score</h2>
        <p className="mt-2 text-4xl font-semibold tabular-nums text-zinc-600">--</p>
        <p className="mt-2 text-sm text-zinc-500">
          Coming soon: nutrition, training, recovery, body composition and activity combined into one score.
        </p>
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

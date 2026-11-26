import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { FirstRunChecklist } from "@/components/first-run-checklist";
import { requireUser } from "@/lib/auth";
import { buildChecklist } from "@/lib/checklist";
import { dismissChecklist } from "../dashboard/guest-actions";
import { GoalCard } from "@/components/goal-card";
import { loadCoach } from "@/lib/coach-data";
import { getToday } from "@/lib/today";
import { diffDays } from "@/lib/dates";
import type { BodyScan, Profile } from "@/lib/types";
import { signOut } from "./actions";

function Row({ href, title, detail }: { href: string; title: string; detail?: string | null }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 px-4 py-3.5 active:bg-zinc-800/60">
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        {detail && <span className="block truncate text-xs text-zinc-500">{detail}</span>}
      </span>
      <span aria-hidden="true" className="text-zinc-500">&rsaquo;</span>
    </Link>
  );
}

export default async function ProfilePage() {
  const { supabase, userId, email, isGuest } = await requireUser();
  const [profileRes, scanRes, raceCount, workoutCount, scanCount, foodCount, garminConn] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>(),
    supabase.from("body_scans").select("*").order("scanned_at", { ascending: false }).limit(1).returns<BodyScan[]>(),
    supabase.from("races").select("id", { count: "exact", head: true }),
    supabase.from("workouts").select("id", { count: "exact", head: true }),
    supabase.from("body_scans").select("id", { count: "exact", head: true }),
    supabase.from("food_entries").select("id", { count: "exact", head: true }),
    supabase.from("garmin_connections").select("user_id", { count: "exact", head: true }),
  ]);
  const profile = profileRes.data ?? null;
  const today = await getToday();
  const coach = await loadCoach(supabase, today, profile);
  const { data: nextRows } = await supabase.from("races").select("name,race_date").gte("race_date", today).order("race_date").limit(1).returns<{ name: string; race_date: string }[]>();
  const next = nextRows?.[0] ?? null;
  const raceDetail = next ? `${next.name} · ${diffDays(today, next.race_date)} days` : (raceCount.count ?? 0) > 0 ? "No upcoming races" : "Add a race to build a plan";
  const metric = profile?.unit_system === "metric";
  const scan = scanRes.data?.[0] ?? null;
  const checklist = buildChecklist({
    races: raceCount.count ?? 0,
    hasTargets: !!profile?.calorie_target && !!profile?.protein_target_g,
    scans: scanCount.count ?? 0,
    workouts: workoutCount.count ?? 0,
    foodEntries: foodCount.count ?? 0,
    garminConnected: (garminConn.count ?? 0) > 0,
  });
  const name = profile?.display_name?.trim() || (isGuest ? "Guest" : (email ?? "").split("@")[0]) || "You";
  const scanSummary = scan
    ? [
        scan.weight_lb !== null ? (metric ? `${(scan.weight_lb * 0.45359237).toFixed(1)} kg` : `${scan.weight_lb} lb`) : null,
        scan.body_fat_pct !== null ? `${scan.body_fat_pct}% body fat` : null,
        scan.scanned_at.slice(0, 10),
      ]
        .filter(Boolean)
        .join(" · ")
    : "No scans yet";
  const targets = profile?.calorie_target ? `${profile.calorie_target} kcal${profile.protein_target_g ? ` · ${profile.protein_target_g} g protein` : ""}` : "Not set";

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>

      <section className="mt-5 flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xl font-semibold text-emerald-300">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-medium">{name}</p>
          <p className="truncate text-sm text-zinc-500">{isGuest ? "Guest session, nothing is kept" : email}</p>
        </div>
      </section>

      {!profile?.onboarding_dismissed_at && checklist.some((i) => !i.done) && <FirstRunChecklist items={checklist} dismiss={dismissChecklist} />}

      <GoalCard goal={coach.goal} rate={coach.rate} weightLb={coach.latest?.weight ?? scan?.weight_lb ?? null} proteinTarget={profile?.protein_target_g ?? null} />

      <ul className="mt-4 divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
        <li><Row href="/races" title="Races" detail={raceDetail} /></li>
        <li><Row href="/scans" title="Body" detail={scanSummary} /></li>
        <li><Row href="/settings" title="Settings" detail={`Targets: ${targets} · ${metric ? "Metric" : "Imperial"}`} /></li>
        <li><Row href="/connect" title="Garmin" detail={(garminConn.count ?? 0) > 0 ? "Connected" : "Not connected"} /></li>
      </ul>

      <form action={signOut} className="mt-6">
        {isGuest ? (
          <ConfirmButton confirmLabel="Leave" message="Leave the guest session? Everything you entered as a guest is deleted and can't be restored." className="w-full rounded-xl border border-zinc-700 px-4 py-3 text-zinc-200 active:bg-zinc-800">
            Leave guest session
          </ConfirmButton>
        ) : (
          <button type="submit" className="w-full rounded-xl border border-zinc-700 px-4 py-3 text-zinc-200 active:bg-zinc-800">
            Sign out
          </button>
        )}
      </form>
    </main>
  );
}

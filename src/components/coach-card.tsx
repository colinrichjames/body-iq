import Link from "next/link";
import { applyCoach, keepTargets, logWeighIn } from "@/app/(app)/nutrition/coach-actions";
import { checkinDue } from "@/lib/coach";
import { GOALS } from "@/lib/goals";
import type { CoachState } from "@/lib/coach-data";
import { btnGhost, btnPrimary, card, field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatDay } from "@/lib/dates";

/** Coach: weight trend against your goal, with a small weekly calorie change you accept or decline. */
export function CoachCard({ coach, today, from }: { coach: CoachState; today: string; from: "/nutrition" | "/dashboard" }) {
  const { advice, trend, mode } = coach;
  const due = checkinDue(coach.lastChecked, today);
  const showAdvice = advice.status === "adjust" && due;
  return (
    <section id="coach" className={`${card} mt-5 scroll-mt-4`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm text-zinc-400">Coach</h2>
        {coach.goal ? (
          <Link href="/profile#goal" className="text-xs text-zinc-500 underline">Goal: {GOALS[coach.goal].label.toLowerCase()}</Link>
        ) : (
          <Link href="/profile#goal" className="text-xs text-emerald-400 underline">Set a goal</Link>
        )}
      </div>

      <p className={`mt-2 font-medium ${advice.status === "adjust" ? "text-amber-300" : advice.status === "on_track" ? "text-emerald-400" : "text-zinc-200"}`}>{!mode && advice.status === "need_data" ? "Pick a goal to start" : advice.headline}</p>
      <p className="mt-1 text-sm text-zinc-400">{mode ? advice.detail : "Set your goal in Profile and log your weight. Each week the coach compares your weight trend with your goal and suggests a small calorie change."}</p>

      {trend && (
        <p className="mt-3 text-sm text-zinc-300">
          Trend weight <span className="tabular-nums font-medium">{trend.trendWeight} lb</span>
          <span className="text-zinc-500"> · {trend.ratePerWeek > 0 ? "+" : ""}{trend.ratePerWeek} lb/week over {trend.spanDays} days</span>
        </p>
      )}

      {showAdvice && (
        <div className="mt-3 flex gap-2">
          <form action={applyCoach} className="flex-1">
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="calories" value={advice.newCalories ?? ""} />
            <input type="hidden" name="rest_calories" value={advice.newRestCalories ?? ""} />
            <input type="hidden" name="carbs_delta" value={advice.carbsDelta} />
            <SubmitButton className={`${btnPrimary} w-full`}>Apply</SubmitButton>
          </form>
          <form action={keepTargets} className="flex-1">
            <input type="hidden" name="from" value={from} />
            <SubmitButton className={`${btnGhost} w-full`}>Keep mine</SubmitButton>
          </form>
        </div>
      )}
      {advice.status === "adjust" && !due && <p className="mt-2 text-xs text-zinc-500">Next weekly check-in {coach.lastChecked ? `after ${formatDay(coach.lastChecked)} + 7 days` : "soon"}.</p>}

      <form action={logWeighIn} className="mt-4 flex items-end gap-2">
        <input type="hidden" name="from" value={from} />
        <label className="flex-1 text-sm text-zinc-400">
          Weigh-in today (lb)
          <input name="weight_lb" type="number" inputMode="decimal" step="0.1" min="50" max="700" placeholder={coach.latest ? String(coach.latest.weight) : "e.g. 182.4"} className={`${field} mt-1`} />
        </label>
        <SubmitButton className={`${btnGhost} h-[46px] px-4`}>Save</SubmitButton>
      </form>
      {coach.recent.length > 0 && <p className="mt-2 text-xs text-zinc-500">Recent: {coach.recent.map((p) => `${p.weight} (${formatDay(p.day)})`).join(" · ")}</p>}

    </section>
  );
}

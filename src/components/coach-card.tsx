import { applyCoach, keepTargets, logWeighIn, saveGoal } from "@/app/(app)/nutrition/coach-actions";
import { checkinDue, GOAL_LABEL, type GoalMode } from "@/lib/coach";
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
    <section className={`${card} mt-5`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm text-zinc-400">Coach</h2>
        {mode && <span className="text-xs text-zinc-500">Goal: {GOAL_LABEL[mode].toLowerCase()}</span>}
      </div>

      <p className={`mt-2 font-medium ${advice.status === "adjust" ? "text-amber-300" : advice.status === "on_track" ? "text-emerald-400" : "text-zinc-200"}`}>{!mode && advice.status === "need_data" ? "Pick a goal to start" : advice.headline}</p>
      <p className="mt-1 text-sm text-zinc-400">{mode ? advice.detail : "Choose lose, maintain or gain below and log your weight. Each week the coach compares your weight trend with your goal and suggests a small calorie change."}</p>

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

      <details className="mt-4 text-sm" open={!mode}>
        <summary className="cursor-pointer text-zinc-400">Goal and pace</summary>
        <form action={saveGoal} className="mt-3 space-y-3">
          <input type="hidden" name="from" value={from} />
          <div className="grid grid-cols-3 gap-1">
            {(Object.keys(GOAL_LABEL) as GoalMode[]).map((g) => (
              <label key={g} className="block">
                <input type="radio" name="goal_mode" value={g} defaultChecked={mode === g} className="peer sr-only" />
                <span className="block cursor-pointer rounded-lg border border-zinc-800 py-2 text-center text-xs text-zinc-400 peer-checked:border-emerald-500 peer-checked:bg-emerald-500/20 peer-checked:text-emerald-300">{GOAL_LABEL[g]}</span>
              </label>
            ))}
          </div>
          <label className="block text-zinc-400">
            Pace (lb per week, blank = 1 to lose, 0.5 to gain)
            <input name="goal_rate" type="number" inputMode="decimal" step="0.25" min="0" max="2" defaultValue={coach.rate ?? ""} className={`${field} mt-1`} />
          </label>
          <SubmitButton className={`${btnGhost} w-full`}>Save goal</SubmitButton>
        </form>
      </details>
    </section>
  );
}

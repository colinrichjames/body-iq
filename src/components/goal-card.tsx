import { saveGoal } from "@/app/(app)/nutrition/coach-actions";
import { btnPrimary, card, field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { GOALS, GOAL_TYPES, goalPlan, type GoalType } from "@/lib/goals";

/** Pick what you're training for. The app turns it into a calorie direction, a pace and recommendations. */
export function GoalCard({ goal, rate, weightLb, proteinTarget }: { goal: GoalType | null; rate: number | null; weightLb: number | null; proteinTarget: number | null }) {
  const plan = goal ? goalPlan(goal, weightLb, proteinTarget) : null;
  return (
    <section id="goal" className={`${card} mt-4 scroll-mt-4`}>
      <h2 className="font-medium">Your goal</h2>
      <p className="mt-1 text-sm text-zinc-400">Pick what you&apos;re working toward. Body IQ adjusts your calorie target each week and tailors its recommendations to it.</p>

      <form action={saveGoal} className="mt-4 space-y-3">
        <input type="hidden" name="from" value="/profile" />
        <div className="grid grid-cols-2 gap-2">
          {GOAL_TYPES.map((t) => (
            <label key={t} className="block">
              <input type="radio" name="goal_type" value={t} defaultChecked={goal === t} className="peer sr-only" />
              <span className="block h-full cursor-pointer rounded-xl border border-zinc-800 px-3 py-2.5 peer-checked:border-emerald-500 peer-checked:bg-emerald-500/15">
                <span className="block text-sm font-medium">{GOALS[t].label}</span>
                <span className="block text-xs text-zinc-500">{GOALS[t].blurb}</span>
              </span>
            </label>
          ))}
        </div>
        <label className="block text-sm text-zinc-400">
          Pace (lb per week, blank uses the goal&apos;s default)
          <input name="goal_rate" type="number" inputMode="decimal" step="0.25" min="0" max="2" defaultValue={rate ?? ""} className={`${field} mt-1`} />
        </label>
        <SubmitButton className={`${btnPrimary} w-full`}>Save goal</SubmitButton>
      </form>

      {goal && plan && (
        <div className="mt-5 border-t border-zinc-800 pt-4">
          <h3 className="text-sm font-medium text-emerald-300">Recommended for {GOALS[goal].label.toLowerCase()}</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-zinc-300">
            {plan.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

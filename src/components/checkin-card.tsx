import { ENERGY_LABELS, SORENESS_LABELS } from "@/lib/checkin";
import { btnGhost, btnPrimary, field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { RecoveryCheckin } from "@/lib/types";
import { clearCheckin, saveCheckin } from "@/app/(app)/recovery/actions";

function Scale({ name, legend, labels, value, low }: { name: string; legend: string; labels: string[]; value: number | null; low: string }) {
  return (
    <fieldset>
      <legend className="text-sm text-zinc-400">
        {legend} <span className="text-zinc-600">(1 = {low})</span>
      </legend>
      <div className="mt-1 grid grid-cols-5 gap-1">
        {labels.map((label, i) => (
          <label key={label} className="block">
            <input type="radio" name={name} value={i + 1} defaultChecked={value === i + 1} className="peer sr-only" />
            <span className="block cursor-pointer rounded-lg border border-zinc-800 py-2 text-center text-xs text-zinc-400 peer-checked:border-emerald-500 peer-checked:bg-emerald-500/20 peer-checked:text-emerald-300 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500">
              <span className="block text-base text-zinc-200">{i + 1}</span>
              {label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Today's self-reported recovery: sleep, soreness, energy. Open when nothing is logged yet, folded once it is. */
export function CheckinCard({ today, existing, from }: { today: string; existing: RecoveryCheckin | null; from: "/dashboard" | "/recovery" }) {
  const summary = existing
    ? [existing.sleep_hours !== null ? `${existing.sleep_hours} h sleep` : null, existing.soreness ? `soreness ${existing.soreness}/5` : null, existing.energy ? `energy ${existing.energy}/5` : null].filter(Boolean).join(" · ")
    : null;
  return (
    <details className="rounded-2xl border border-zinc-800 p-5" open={!existing} data-day={today}>
      <summary className="cursor-pointer text-sm">
        <span className="font-medium text-zinc-200">{existing ? "Today's check-in" : "How do you feel today?"}</span>
        {summary && <span className="ml-2 text-zinc-500">{summary}</span>}
      </summary>
      <form action={saveCheckin} className="mt-4 space-y-4">
        <input type="hidden" name="from" value={from} />
        <label className="block text-sm text-zinc-400">
          Sleep last night (hours)
          <input name="sleep_hours" type="number" inputMode="decimal" min="0" max="16" step="0.25" defaultValue={existing?.sleep_hours ?? ""} placeholder="e.g. 7.5" className={`${field} mt-1`} />
        </label>
        <Scale name="soreness" legend="Muscle soreness" labels={SORENESS_LABELS} value={existing?.soreness ?? null} low="none" />
        <Scale name="energy" legend="Energy" labels={ENERGY_LABELS} value={existing?.energy ?? null} low="drained" />
        <p className="text-xs text-zinc-500">Answer what you like. It feeds the same readiness call as a watch: short sleep, high soreness or low energy lean it towards an easier day. If you have a Garmin, its sleep number wins.</p>
        <SubmitButton className={`${btnPrimary} w-full`}>{existing ? "Update check-in" : "Save check-in"}</SubmitButton>
      </form>
      {existing && (
        <form action={clearCheckin} className="mt-2">
          <input type="hidden" name="from" value={from} />
          <button type="submit" className={`${btnGhost} w-full text-sm`}>
            Remove today&apos;s check-in
          </button>
        </form>
      )}
    </details>
  );
}

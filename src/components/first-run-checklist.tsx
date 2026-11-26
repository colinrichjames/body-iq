import Link from "next/link";
import type { ChecklistItem } from "@/lib/checklist";
import { checklistProgress } from "@/lib/checklist";
import { SubmitButton } from "@/components/submit-button";

/** "Get set up" card on the dashboard for new accounts. Done steps are ticked from real data. */
export function FirstRunChecklist({ items, dismiss }: { items: ChecklistItem[]; dismiss: () => Promise<void> }) {
  const p = checklistProgress(items);
  const open = items.filter((i) => !i.done);
  if (p.complete) {
    // Every required step is done. Keep a small "all set" card while an optional step (Garmin) is still open.
    return (
      <section className="mt-4 rounded-2xl border border-emerald-800/60 bg-emerald-950/20 p-4" aria-label="Set up complete">
        <h2 className="font-medium">You&apos;re all set up 🎉</h2>
        {open.map((i) => (
          <Link key={i.key} href={i.href} className="mt-2 block text-sm text-emerald-300">
            {i.title} <span className="text-xs text-zinc-500">(optional)</span>
            <span className="block text-xs text-zinc-500">{i.hint}</span>
          </Link>
        ))}
        <form action={dismiss} className="mt-2 text-right">
          <SubmitButton pendingText="Hiding..." className="text-xs text-zinc-500 underline">
            Hide this
          </SubmitButton>
        </form>
      </section>
    );
  }
  return (
    <section className="mt-4 rounded-2xl border border-emerald-800/60 bg-emerald-950/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">Get set up</h2>
        <span className="text-xs text-emerald-300 tabular-nums">
          {p.done} of {p.total} done
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full bg-emerald-500" style={{ width: `${(p.done / p.total) * 100}%` }} />
      </div>
      <ul className="mt-3 divide-y divide-zinc-800/70">
        {items.map((i) => (
          <li key={i.key}>
            <Link href={i.href} className="flex items-start gap-3 py-2.5">
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${i.done ? "border-emerald-500 bg-emerald-500 text-zinc-950" : "border-zinc-600 text-transparent"}`}
              >
                ✓
              </span>
              <span className="min-w-0">
                <span className={`block text-sm ${i.done ? "text-zinc-500" : ""}`}>
                  {i.title}
                  {i.optional ? <span className="ml-1 text-xs text-zinc-500 no-underline">(optional)</span> : null}
                </span>
                {!i.done && <span className="block text-xs text-zinc-500">{i.hint}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <form action={dismiss} className="mt-2 text-right">
        <SubmitButton pendingText="Hiding..." className="text-xs text-zinc-500 underline">
          Hide this
        </SubmitButton>
      </form>
    </section>
  );
}

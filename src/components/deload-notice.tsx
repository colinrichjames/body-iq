import { DELOAD_PLAN, type DeloadCheck } from "@/lib/progression";

/** Shown when the strength history says an easier week is due ("deload") or worth watching ("watch"). */
export function DeloadNotice({ check }: { check: DeloadCheck }) {
  if (check.level === "none") return null;
  const deload = check.level === "deload";
  return (
    <section className={`mt-6 rounded-2xl border p-5 text-sm ${deload ? "border-amber-900 bg-amber-950/30" : "border-zinc-800 bg-zinc-900"}`}>
      <p className={`font-medium ${deload ? "text-amber-300" : "text-zinc-200"}`}>{deload ? "Time for a deload week" : "Keep an eye on your recovery"}</p>
      <ul className="mt-1 list-disc pl-5 text-zinc-300">
        {check.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {deload && <p className="mt-2 text-zinc-400">{DELOAD_PLAN} Suggested weights in the workout screen already use the lighter load.</p>}
    </section>
  );
}

const STYLE: Record<string, { label: string; cls: string }> = {
  planned: { label: "Planned", cls: "border-zinc-700 text-zinc-400" },
  in_progress: { label: "In progress", cls: "border-amber-500/50 bg-amber-500/10 text-amber-400" },
  completed: { label: "Completed", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
  skipped: { label: "Skipped", cls: "border-zinc-800 text-zinc-500" },
  missed: { label: "Missed", cls: "border-amber-900 text-amber-500" },
};

/** One status look everywhere: Planned, In progress (amber), Completed, Skipped, Missed. */
export function StatusBadge({ status, overdue = false }: { status: string; overdue?: boolean }) {
  const key = status === "planned" && overdue ? "missed" : status;
  const s = STYLE[key] ?? STYLE.planned;
  return <span className={`inline-block shrink-0 rounded-full border px-2 py-0.5 text-xs ${s.cls}`}>{s.label}</span>;
}

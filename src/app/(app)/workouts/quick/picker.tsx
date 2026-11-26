"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { btnPrimary, field } from "@/components/ui";
import { pickedToExercises } from "@/lib/quick-start";
import { HourField } from "./hour-field";
import { startQuickWorkout } from "../actions";

type Row = { name: string; sets: string; reps: string };

export function QuickPicker({ recent, staples }: { recent: string[]; staples: string[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [custom, setCustom] = useState("");
  const has = (n: string) => rows.some((r) => r.name.toLowerCase() === n.toLowerCase());
  const toggle = (n: string) => setRows((cur) => (has(n) ? cur.filter((r) => r.name.toLowerCase() !== n.toLowerCase()) : [...cur, { name: n, sets: "3", reps: "10" }]));
  const patch = (i: number, p: Partial<Row>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const json = JSON.stringify(pickedToExercises(rows.map((r) => ({ name: r.name, sets: Number(r.sets), reps: Number(r.reps) }))));
  const chips = [...recent, ...staples.filter((s) => !recent.some((r) => r.toLowerCase() === s.toLowerCase()))];

  function addCustom() {
    const n = custom.trim();
    if (n && !has(n)) setRows((cur) => [...cur, { name: n, sets: "3", reps: "10" }]);
    setCustom("");
  }

  return (
    <form action={startQuickWorkout} className="mt-3 space-y-4">
      <input type="hidden" name="mode" value="pick" />
      <input type="hidden" name="exercises_json" value={json} />
      <HourField />

      {recent.length > 0 && <p className="text-xs text-zinc-500">Your recent lifts come first.</p>}
      <div className="flex flex-wrap gap-2">
        {chips.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={has(n)}
            onClick={() => toggle(n)}
            className={`rounded-full border px-3 py-1.5 text-sm ${has(n) ? "border-emerald-500 bg-emerald-500/15 text-emerald-300" : "border-zinc-700 text-zinc-300 active:bg-zinc-800"}`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Add another exercise"
          aria-label="Add another exercise"
          className={`${field} flex-1`}
        />
        <button type="button" onClick={addCustom} className="rounded-xl border border-zinc-700 px-4 text-zinc-200 active:bg-zinc-800">
          Add
        </button>
      </div>

      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.name} className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
              <span className="flex-1 truncate text-sm">{r.name}</span>
              <input aria-label={`${r.name} sets`} type="number" inputMode="numeric" min="1" value={r.sets} onChange={(e) => patch(i, { sets: e.target.value })} className="w-12 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-center text-sm" />
              <span className="text-zinc-500">×</span>
              <input aria-label={`${r.name} reps`} type="number" inputMode="numeric" min="1" value={r.reps} onChange={(e) => patch(i, { reps: e.target.value })} className="w-12 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-center text-sm" />
              <button type="button" aria-label={`Remove ${r.name}`} onClick={() => toggle(r.name)} className="px-1 text-zinc-500">
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}

      <SubmitButton className={`${btnPrimary} w-full`} pendingText="Starting...">
        {rows.length ? `Start workout (${rows.length} exercise${rows.length === 1 ? "" : "s"})` : "Start workout"}
      </SubmitButton>
    </form>
  );
}

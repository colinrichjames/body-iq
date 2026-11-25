"use client";

import { Field } from "@/components/field";
import { useState } from "react";
import { btnGhost, field } from "@/components/ui";
import { parseExercises } from "@/lib/structure";
import type { Exercise } from "@/lib/types";

type Row = { key: number; name: string; sets: string; amount: string; timed: boolean; weight: string };

let counter = 0;
const toRow = (e: Exercise): Row => ({
  key: ++counter,
  name: e.name,
  sets: e.sets ? String(e.sets) : "",
  amount: String(e.seconds ?? e.reps ?? ""),
  timed: !!e.seconds,
  weight: e.weight_lb ? String(e.weight_lb) : "",
});
const blank = (): Row => toRow({ name: "" });

/**
 * One row per exercise, so nothing depends on line breaks surviving a text box.
 * Submits as a hidden JSON field (exercises_json). Paste a list to fill rows from text.
 */
export function ExerciseEditor({ initial }: { initial: Exercise[] }) {
  const [rows, setRows] = useState<Row[]>(() => (initial.length ? initial.map(toRow) : [blank()]));
  const [paste, setPaste] = useState("");

  const update = (key: number, patch: Partial<Row>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const num = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? undefined : Number(s));

  const json = JSON.stringify(
    rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        sets: num(r.sets),
        ...(r.timed ? { seconds: num(r.amount) } : { reps: num(r.amount) }),
        weight_lb: num(r.weight),
      })),
  );

  function addPasted() {
    const parsed = parseExercises(paste);
    if (!parsed.length) return;
    setRows((cur) => [...cur.filter((r) => r.name.trim()), ...parsed.map(toRow)]);
    setPaste("");
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="exercises_json" value={json} />
      <p className="text-xs text-zinc-500">Exercises</p>
      {rows.map((r, i) => (
        <div key={r.key} className="rounded-xl border border-zinc-800 p-2">
          <div className="flex gap-2">
            <Field label={`Exercise ${i + 1}`} className="min-w-0 flex-1"><input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} placeholder="e.g. Back squat" className={field} /></Field>
            <button type="button" onClick={() => setRows((cur) => (cur.length > 1 ? cur.filter((x) => x.key !== r.key) : [blank()]))} className="shrink-0 self-end px-2 py-2.5 text-sm text-zinc-500 active:text-red-400" aria-label={`Remove exercise ${i + 1}`}>
              Remove
            </button>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            <Field label="Sets"><input value={r.sets} onChange={(e) => update(r.key, { sets: e.target.value })} type="number" inputMode="numeric" min="1" className={field} /></Field>
            <Field label={r.timed ? "Seconds" : "Reps"}><input value={r.amount} onChange={(e) => update(r.key, { amount: e.target.value })} type="number" inputMode="numeric" min="1" className={field} /></Field>
            <button type="button" onClick={() => update(r.key, { timed: !r.timed })} className={`${btnGhost} self-end px-1 text-xs`} aria-label={`Switch to ${r.timed ? "reps" : "timed"}`}>
              {r.timed ? "Timed" : "Reps"}
            </button>
            <Field label="Weight (lb)"><input value={r.weight} onChange={(e) => update(r.key, { weight: e.target.value })} type="number" inputMode="decimal" step="any" min="0" className={field} /></Field>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setRows((cur) => [...cur, blank()])} className={`${btnGhost} w-full text-sm`}>
        Add exercise
      </button>
      <details className="text-sm">
        <summary className="cursor-pointer text-zinc-400">Paste a list instead</summary>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} placeholder={"Back squat 4x6 @ 135\nPull-ups 3x8\nPlank 3x45s"} className={`${field} mt-2 font-mono text-sm`} />
        <button type="button" onClick={addPasted} className={`${btnGhost} mt-2 text-sm`}>
          Add these as rows
        </button>
      </details>
    </div>
  );
}

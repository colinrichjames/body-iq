"use client";

import { useState } from "react";

/** Keyboard- and screen-reader-friendly way to reschedule a session: pick a date and press Move. Drag and drop stays as a shortcut. */
export function MoveControl({ title, current, onMove }: { title: string; current: string; onMove: (day: string) => void }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(current);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setDay(current);
          setOpen(true);
        }}
        aria-label={`Move ${title} to another day`}
        className="shrink-0 rounded-lg border border-zinc-800 px-2 text-xs text-zinc-400 active:bg-zinc-800"
      >
        Move
      </button>
    );
  }
  return (
    <div className="flex basis-full items-center gap-2 pb-2 pl-1">
      <input
        type="date"
        value={day}
        onChange={(e) => setDay(e.target.value)}
        aria-label={`New date for ${title}`}
        autoFocus
        className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
      />
      <button
        type="button"
        disabled={!day || day === current}
        onClick={() => {
          setOpen(false);
          onMove(day);
        }}
        className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950 disabled:opacity-40"
      >
        Move
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-2 text-sm text-zinc-400">
        Cancel
      </button>
    </div>
  );
}

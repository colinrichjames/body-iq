"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { field } from "@/components/ui";
import { saveMealFromDay } from "./actions";

/** Saves a logged meal as a reusable one (shown under Meals when adding food). */
export function SaveMeal({ day, meal }: { day: string; meal: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await saveMealFromDay(day, meal, name);
    setBusy(false);
    if (res.error) return setErr(res.error);
    toast(`Saved ${name.trim()}.`);
    setOpen(false);
    setName("");
    setErr(null);
    router.refresh();
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs normal-case tracking-normal text-emerald-400">
        Save as meal
      </button>
    );
  return (
    <div className="mt-2 w-full normal-case tracking-normal">
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Meal name" placeholder="Name this meal" className={field} />
        <button type="button" onClick={() => void save()} disabled={busy} className="shrink-0 rounded-xl bg-emerald-500 px-4 text-sm font-medium text-zinc-950">
          {busy ? "..." : "Save"}
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-amber-300">{err}</p>}
    </div>
  );
}

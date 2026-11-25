"use client";

import { useToast } from "@/components/toast";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { aggregateMfp, type ParseResult } from "@/lib/mfp";
import { btnPrimary, card } from "@/components/ui";
import { importNutrition } from "./actions";

export function Importer() {
  const router = useRouter();
  const { toast } = useToast();
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    setMessage(null);
    setParsed(null);
    if (!file) return;
    setFileName(file.name);
    if (file.size > 5_000_000) {
      setParsed({ rows: [], skippedRows: 0, error: "File is larger than 5 MB. Export a shorter date range." });
      return;
    }
    setParsed(aggregateMfp(await file.text()));
  }

  async function save() {
    if (!parsed?.rows.length) return;
    setBusy(true);
    const res = await importNutrition(parsed.rows);
    setBusy(false);
    if (res.error) return setMessage(res.error);
    const msg = `Imported ${res.count} day${res.count === 1 ? "" : "s"} into your food log.${res.skipped ? ` Skipped ${res.skipped} day${res.skipped === 1 ? "" : "s"} that already have food logged here.` : ""}`;
    setMessage(msg);
    toast(msg);
    setParsed(null);
    router.refresh();
  }

  const first = parsed?.rows[0];
  const last = parsed?.rows[parsed.rows.length - 1];

  return (
    <section className={`${card} mt-6`}>
      <h2 className="font-medium">Import from MyFitnessPal</h2>
      <p className="mt-1 text-sm text-zinc-500">
        In MyFitnessPal on the web: Settings, Export Data, Nutrition Summary (CSV). Upload the file here. Re-importing the same days just updates them.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => onFile(e.target.files?.[0])}
        className="mt-3 block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-zinc-200"
      />
      {parsed?.error && <p className="mt-3 text-sm text-red-300">{parsed.error}</p>}
      {parsed && !parsed.error && first && last && (
        <div className="mt-3 text-sm">
          <p className="text-zinc-300">
            {fileName}: {parsed.rows.length} days with food logged ({first.day} to {last.day}).
          </p>
          <button onClick={save} disabled={busy} className={`${btnPrimary} mt-3 w-full`}>
            {busy ? "Importing..." : `Import ${parsed.rows.length} days`}
          </button>
        </div>
      )}
      {message && <p className="mt-3 text-sm text-emerald-400">{message}</p>}
    </section>
  );
}

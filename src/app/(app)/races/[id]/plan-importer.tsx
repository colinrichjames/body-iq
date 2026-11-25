"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseCsv } from "@/lib/mfp";
import { btnPrimary, card } from "@/components/ui";
import { importPlanRows, type PlanCsvRow } from "../actions";

function toIso(raw: string): string {
  const s = raw.trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : s.slice(0, 10);
}

function parsePlan(text: string): { rows: PlanCsvRow[]; error?: string } {
  const table = parseCsv(text);
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const c = {
    date: idx(["date", "day"]),
    sport: idx(["sport", "type", "discipline"]),
    title: idx(["title", "name", "workout", "session"]),
    dur: idx(["duration_min", "duration", "minutes", "min"]),
    desc: idx(["description", "details", "notes"]),
  };
  if (c.date < 0 || c.title < 0) return { rows: [], error: "The first row must be a header with at least date and title columns." };
  const rows = table.slice(1).map((r) => ({
    date: toIso(r[c.date] ?? ""),
    sport: (c.sport >= 0 ? (r[c.sport] ?? "") : "").trim().toLowerCase(),
    title: r[c.title] ?? "",
    duration_min: c.dur >= 0 && r[c.dur]?.trim() ? Number(r[c.dur]) || null : null,
    description: c.desc >= 0 ? (r[c.desc] ?? "") : "",
  }));
  return { rows };
}

export function PlanImporter({ raceId }: { raceId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<PlanCsvRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    setMsg(null);
    setErr(null);
    setRows(null);
    if (!file) return;
    if (file.size > 2_000_000) return setErr("File is larger than 2 MB.");
    const res = parsePlan(await file.text());
    if (res.error) return setErr(res.error);
    setRows(res.rows);
  }

  async function save() {
    if (!rows) return;
    setBusy(true);
    const res = await importPlanRows(raceId, rows);
    setBusy(false);
    if (res.error) return setErr(res.error);
    setMsg(`Imported ${res.count} sessions. They're in Train.`);
    setRows(null);
    router.refresh();
  }

  return (
    <section className={`${card} mt-4`}>
      <h2 className="font-medium">Import a plan from CSV</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Bring in an existing calendar. Columns: <span className="font-mono text-zinc-400">date, sport, title, duration_min, description</span>. Dates as YYYY-MM-DD or M/D/YYYY. Sport is one of run, bike, swim, strength, hyrox, mobility, other.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => onFile(e.target.files?.[0])}
        className="mt-3 block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-zinc-200"
      />
      {rows && (
        <button onClick={save} disabled={busy} className={`${btnPrimary} mt-3 w-full`}>
          {busy ? "Importing..." : `Import ${rows.length} rows`}
        </button>
      )}
      {err && <p className="mt-3 text-sm text-red-300">{err}</p>}
      {msg && <p className="mt-3 text-sm text-emerald-400">{msg}</p>}
    </section>
  );
}

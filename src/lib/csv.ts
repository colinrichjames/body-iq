function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Rows to CSV. With `columns`, only those columns in that order, and the header is written even when there are no
 * rows (so the file is never empty). Without it, the union of all keys, minus raw_json.
 */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  // Raw Garmin payloads are huge and belong in the JSON export, not a spreadsheet.
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => c !== "raw_json");
  if (cols.length === 0) return "";
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
}

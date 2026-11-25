const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** A spreadsheet runs a cell that starts with = + - @ as a formula. Text like that is prefixed with ' so it stays text. */
export function safeText(s: string): string {
  return /^[=+\-@\t\r]/.test(s) && !PLAIN_NUMBER.test(s) ? `'${s}` : s;
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : typeof v === "string" ? safeText(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Columns that are noise or internal in a spreadsheet: your own id on every row, raw Garmin payloads, resume state. */
export const CSV_HIDDEN = ["user_id", "raw_json", "progress"];

/**
 * Rows to CSV. With `columns`, only those columns in that order, and the header is written even when there are no
 * rows (so the file is never empty). Without it, the union of all keys minus the hidden ones.
 */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => !CSV_HIDDEN.includes(c));
  if (cols.length === 0) return "";
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
}

/** Excel opens a UTF-8 file correctly (accents, symbols) only with a byte order mark in front. */
export const withBom = (csv: string) => `\uFEFF${csv}`;

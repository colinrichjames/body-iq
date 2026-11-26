/**
 * "Latest scan" everywhere: newest scan date first, and when two scans share a date the one saved last wins
 * (then id, so the order never flips between pages or reloads).
 */
type Orderable = { order: (column: string, opts: { ascending: boolean }) => unknown };

export function newestScanFirst<T extends Orderable>(query: T): T {
  const q = query as unknown as { order: (c: string, o: { ascending: boolean }) => typeof q };
  return q.order("scanned_at", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }) as unknown as T;
}

/** The same order for rows already in memory. */
export function sortScansNewestFirst<S extends { scanned_at: string; created_at?: string; id: string }>(rows: S[]): S[] {
  return [...rows].sort((a, b) => (a.scanned_at !== b.scanned_at ? (a.scanned_at < b.scanned_at ? 1 : -1) : (a.created_at ?? "") !== (b.created_at ?? "") ? ((a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1) : a.id < b.id ? 1 : -1));
}

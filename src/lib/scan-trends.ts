import type { BodyScan } from "./types";

export type ScanMetric = "weight_lb" | "body_fat_pct" | "skeletal_muscle_lb" | "fat_mass_lb";

export const SCAN_METRICS: { key: ScanMetric; label: string; unit: string; /** Which direction is usually the goal, for colouring the change. */ good: "down" | "up" | "either" }[] = [
  { key: "weight_lb", label: "Weight", unit: "lb", good: "either" },
  { key: "body_fat_pct", label: "Body fat", unit: "%", good: "down" },
  { key: "skeletal_muscle_lb", label: "Skeletal muscle", unit: "lb", good: "up" },
  { key: "fat_mass_lb", label: "Fat mass", unit: "lb", good: "down" },
];

export type TrendPoint = { date: string; value: number };

/** Oldest-first points for one metric. Scans without a value are skipped; same-day scans keep the latest entry. */
export function trendPoints(scans: BodyScan[], key: ScanMetric): TrendPoint[] {
  const byDay = new Map<string, TrendPoint>();
  for (const s of [...scans].sort((a, b) => (a.scanned_at === b.scanned_at ? Date.parse(a.created_at) - Date.parse(b.created_at) : a.scanned_at < b.scanned_at ? -1 : 1))) {
    const v = s[key];
    if (v !== null && v !== undefined && Number.isFinite(Number(v))) byDay.set(s.scanned_at.slice(0, 10), { date: s.scanned_at.slice(0, 10), value: Number(v) });
  }
  return [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Change from the previous point to the last, rounded to one decimal. Null with fewer than two points. */
export function lastChange(points: TrendPoint[]): number | null {
  if (points.length < 2) return null;
  return Math.round((points[points.length - 1].value - points[points.length - 2].value) * 10) / 10;
}

/** Change from the first point to the last, rounded to one decimal. */
export function totalChange(points: TrendPoint[]): number | null {
  if (points.length < 2) return null;
  return Math.round((points[points.length - 1].value - points[0].value) * 10) / 10;
}

export const fmtChange = (n: number, unit: string) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n)}${unit === "%" ? " pts" : ` ${unit}`}`;

/** Screen-space points for an SVG line chart of the given size, with padding. A flat series sits mid-height. */
export function chartPath(points: TrendPoint[], w: number, h: number, pad = 8): { x: number; y: number }[] {
  if (!points.length) return [];
  const t0 = Date.parse(points[0].date);
  const t1 = Date.parse(points[points.length - 1].date);
  const lo = Math.min(...points.map((p) => p.value));
  const hi = Math.max(...points.map((p) => p.value));
  return points.map((p) => ({
    x: pad + (t1 === t0 ? (w - 2 * pad) / 2 : ((Date.parse(p.date) - t0) / (t1 - t0)) * (w - 2 * pad)),
    y: hi === lo ? h / 2 : pad + (1 - (p.value - lo) / (hi - lo)) * (h - 2 * pad),
  }));
}

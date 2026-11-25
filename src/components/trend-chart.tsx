import { chartPath, fmtChange, lastChange, totalChange, type TrendPoint } from "@/lib/scan-trends";

const W = 280;
const H = 84;

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Small line chart (inline SVG, no library) with first/last values and the change since the previous point. */
export function TrendChart({ label, unit, points, good }: { label: string; unit: string; points: TrendPoint[]; good: "down" | "up" | "either" }) {
  const last = points[points.length - 1];
  const change = lastChange(points);
  const total = totalChange(points);
  const pts = chartPath(points, W, H);
  const toneFor = (n: number | null) => (n === null || n === 0 || good === "either" ? "text-zinc-400" : (n < 0) === (good === "down") ? "text-emerald-400" : "text-amber-400");
  const fmtVal = (v: number) => (unit === "%" ? `${v}%` : `${v} ${unit}`);
  return (
    <figure className="rounded-2xl border border-zinc-800 p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-zinc-400">{label}</span>
        {last && <span className="font-medium tabular-nums">{fmtVal(last.value)}</span>}
      </figcaption>
      {points.length < 2 ? (
        <p className="mt-2 text-sm text-zinc-500">{points.length === 0 ? "No values logged yet." : "Log one more scan to see a trend."}</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-20 w-full" role="img" aria-label={`${label} from ${fmtVal(points[0].value)} on ${day(points[0].date)} to ${fmtVal(last.value)} on ${day(last.date)}`}>
            <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="text-emerald-500" />
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 4 : 2.5} className={i === pts.length - 1 ? "fill-emerald-400" : "fill-zinc-500"} />
            ))}
          </svg>
          <div className="mt-1 flex justify-between text-xs text-zinc-500">
            <span>
              {day(points[0].date)} · {fmtVal(points[0].value)}
            </span>
            <span>{day(last.date)}</span>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            <span className={toneFor(change)}>{change === null ? "" : `${fmtChange(change, unit)} since last scan`}</span>
            {total !== null && points.length > 2 ? <span> · {fmtChange(total, unit)} overall</span> : null}
          </p>
        </>
      )}
    </figure>
  );
}

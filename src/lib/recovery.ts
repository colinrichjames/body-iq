import type { DailyHealth } from "./types";

export type Tone = "good" | "ok" | "warn" | "bad" | "none";
export type MetricRead = { key: string; label: string; value: string; tone: Tone; meaning: string };

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const nums = (xs: (number | null)[]) => xs.filter((v): v is number => v !== null);

/** Explains each Garmin number for one day in plain language. `base` is the previous days (newest first). */
export function explainDay(day: DailyHealth, base: DailyHealth[]): MetricRead[] {
  const b = base.slice(0, 7);
  const out: MetricRead[] = [];

  if (day.sleep_seconds !== null) {
    const h = day.sleep_seconds / 3600;
    const tone: Tone = h >= 7 ? "good" : h >= 6.5 ? "ok" : h >= 5.5 ? "warn" : "bad";
    const score = day.sleep_score !== null ? `, Garmin score ${day.sleep_score}` : "";
    out.push({
      key: "sleep",
      label: "Sleep",
      value: `${h.toFixed(1)} h${score}`,
      tone,
      meaning:
        tone === "good" ? "Enough sleep for hard training." : tone === "ok" ? "Slightly short. Fine for easy to moderate days." : tone === "warn" ? "Short. Hard sessions will cost more than usual." : "Very short. Treat today as recovery.",
    });
  } else out.push({ key: "sleep", label: "Sleep", value: "no data", tone: "none", meaning: "Wear the watch overnight to get sleep and HRV." });

  if (day.hrv_ms !== null) {
    const base_ = avg(nums(b.map((r) => r.hrv_ms)));
    if (base_ !== null && nums(b.map((r) => r.hrv_ms)).length >= 3) {
      const ratio = day.hrv_ms / base_;
      const tone: Tone = ratio >= 0.95 ? "good" : ratio >= 0.9 ? "ok" : ratio >= 0.8 ? "warn" : "bad";
      out.push({
        key: "hrv",
        label: "HRV (overnight)",
        value: `${Math.round(day.hrv_ms)} ms vs ${Math.round(base_)} baseline`,
        tone,
        meaning:
          tone === "good" ? "At or above your normal. Your nervous system is recovered." : tone === "ok" ? "A little under normal. Not a concern on its own." : tone === "warn" ? "Clearly under your normal. Fatigue, poor sleep, alcohol or illness coming on." : "Far under your normal. Back off today.",
      });
    } else out.push({ key: "hrv", label: "HRV (overnight)", value: `${Math.round(day.hrv_ms)} ms`, tone: "none", meaning: "Needs 3+ earlier days to compare against your own baseline." });
  } else out.push({ key: "hrv", label: "HRV (overnight)", value: "no data", tone: "none", meaning: "Not reported for this day." });

  if (day.resting_hr !== null) {
    const base_ = avg(nums(b.map((r) => r.resting_hr)));
    const diff = base_ !== null ? day.resting_hr - base_ : null;
    const tone: Tone = diff === null ? "none" : diff <= 2 ? "good" : diff < 5 ? "ok" : "warn";
    out.push({
      key: "rhr",
      label: "Resting HR",
      value: `${day.resting_hr} bpm${base_ !== null ? ` vs ${Math.round(base_)} baseline` : ""}`,
      tone,
      meaning: tone === "warn" ? "5+ bpm above normal. Common sign of fatigue, heat or illness." : tone === "none" ? "Needs more days to compare." : "Within your normal range.",
    });
  }

  if (day.body_battery_max !== null) {
    const m = day.body_battery_max;
    const tone: Tone = m >= 75 ? "good" : m >= 50 ? "ok" : m >= 40 ? "warn" : "bad";
    out.push({
      key: "battery",
      label: "Body Battery peak",
      value: `${m}${day.body_battery_min !== null ? ` (low ${day.body_battery_min})` : ""}`,
      tone,
      meaning: tone === "good" ? "Recharged overnight." : tone === "ok" ? "Partly recharged." : "Barely recharged. Sleep, stress or training load is draining you.",
    });
  }

  if (day.stress_avg !== null) {
    const s = day.stress_avg;
    const tone: Tone = s < 26 ? "good" : s < 40 ? "ok" : s < 50 ? "warn" : "bad";
    out.push({
      key: "stress",
      label: "Average stress",
      value: `${s}`,
      tone,
      meaning: tone === "good" ? "Low. Resting state most of the day." : tone === "ok" ? "Normal for a working day." : "High. Hard to recover while this stays up.",
    });
  }

  if (day.steps !== null) out.push({ key: "steps", label: "Steps", value: day.steps.toLocaleString(), tone: "none", meaning: "Daily movement. Counts toward activity, not recovery." });
  return out;
}

/** Garmin training load per session: rough effort bands. */
export function loadBand(load: number | null): { label: string; tone: Tone } {
  if (load === null) return { label: "no load", tone: "none" };
  if (load >= 150) return { label: "very hard", tone: "bad" };
  if (load >= 90) return { label: "hard", tone: "warn" };
  if (load >= 40) return { label: "moderate", tone: "ok" };
  return { label: "light", tone: "good" };
}

export const toneClass: Record<Tone, string> = {
  good: "text-emerald-400",
  ok: "text-zinc-200",
  warn: "text-amber-400",
  bad: "text-red-400",
  none: "text-zinc-500",
};

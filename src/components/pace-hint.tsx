"use client";

import { useEffect, useRef, useState } from "react";
import { isUnit, paceLabel, sessionPaceProblem, toKm, type DistUnit } from "@/lib/distance";

/**
 * Shows the pace that the form's minutes and distance work out to, before the user saves. A pace outside the sane band
 * is shown as the same warning the save would give. Reads the sport, planned_duration_min, planned_distance and
 * distance_unit fields of the form it sits in.
 */
export function PaceHint() {
  const marker = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<{ pace: string | null; problem: string | null }>({ pace: null, problem: null });

  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    const read = () => {
      const get = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "";
      const sport = get("sport");
      const title = get("title");
      const minutes = Number(get("planned_duration_min"));
      const dist = Number(get("planned_distance"));
      const u = get("distance_unit");
      const unit: DistUnit = isUnit(u) ? u : "mi";
      if (!(minutes > 0) || !(dist > 0)) return setState({ pace: null, problem: null });
      const km = toKm(dist, unit);
      setState({ pace: paceLabel(sport, minutes, km, unit, title), problem: sessionPaceProblem(sport, minutes, km, title) });
    };
    read();
    form.addEventListener("input", read);
    form.addEventListener("change", read);
    return () => {
      form.removeEventListener("input", read);
      form.removeEventListener("change", read);
    };
  }, []);

  return (
    <span ref={marker} className="block" aria-live="polite">
      {state.problem ? (
        <span className="block text-sm text-red-400">{state.problem} ({state.pace})</span>
      ) : state.pace ? (
        <span className="block text-sm text-zinc-400">Pace {state.pace}</span>
      ) : null}
    </span>
  );
}

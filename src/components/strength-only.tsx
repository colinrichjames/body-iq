"use client";

import { useEffect, useRef, useState } from "react";
import { isEndurance } from "@/lib/sport-kind";

/**
 * Shows its children (exercises, rounds, rest) only while the form's sport is a strength-type one. A run, bike or swim
 * is described by duration and distance, so an exercise list there is just noise. Reads the form's `sport` select.
 */
export function StrengthOnly({ initialSport, children }: { initialSport: string; children: React.ReactNode }) {
  const marker = useRef<HTMLSpanElement>(null);
  const [sport, setSport] = useState(initialSport);

  useEffect(() => {
    const form = marker.current?.closest("form");
    const select = form?.elements.namedItem("sport") as HTMLSelectElement | null;
    if (!form || !select) return;
    const read = () => setSport(select.value);
    form.addEventListener("change", read);
    return () => form.removeEventListener("change", read);
  }, []);

  return (
    <>
      <span ref={marker} hidden />
      {isEndurance(sport) ? null : children}
    </>
  );
}

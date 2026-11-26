"use client";

import dynamic from "next/dynamic";
import type { BlockLog, SetLog, Workout } from "@/lib/types";

// The assistant reads saved progress from this phone's storage, so it renders in the browser only.
const Assistant = dynamic(() => import("./assistant").then((m) => m.Assistant), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-zinc-500">Loading workout...</p>,
});

export function AssistantLoader(props: { workout: Workout; lastWeights: Record<string, number>; lastTime: Record<string, string>; recent?: string[]; targets?: Record<string, number>; lastVolume?: Record<string, number>; suggested?: Record<string, { weight: number; text: string }>; deload?: boolean; adaptation?: { headline: string; reasons: string[]; mode: string }; initialTotals?: Record<string, number> | null; lastEndurance?: { date: string; km: number | null; minutes: number | null } | null; plannedDistanceKm?: number | null; distanceUnit?: "mi" | "km"; targetRace?: string | null; serverResume: { logs: SetLog[]; blocks: BlockLog[]; stepIndex: number; blockIndex: number; elapsedMs: number } | null }) {
  return <Assistant {...props} />;
}

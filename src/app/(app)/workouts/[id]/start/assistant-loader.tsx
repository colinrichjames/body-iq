"use client";

import dynamic from "next/dynamic";
import type { Workout } from "@/lib/types";
import type { SetLog } from "../../actions";

// The assistant reads saved progress from this phone's storage, so it renders in the browser only.
const Assistant = dynamic(() => import("./assistant").then((m) => m.Assistant), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-zinc-500">Loading workout...</p>,
});

export function AssistantLoader(props: { workout: Workout; lastWeights: Record<string, number>; lastTime: Record<string, string>; serverResume: { logs: SetLog[]; stepIndex: number; blockIndex: number; elapsedMs: number } | null }) {
  return <Assistant {...props} />;
}

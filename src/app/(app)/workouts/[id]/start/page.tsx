import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { Workout } from "@/lib/types";
import { AssistantLoader } from "./assistant-loader";

export default async function StartWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: w } = await supabase.from("workouts").select("*").eq("id", id).maybeSingle<Workout>();
  if (!w) notFound();
  if (w.status === "completed") redirect(`/workouts/${id}`);

  // Pre-fill weights from the last time each exercise was logged.
  const names = (w.structure?.exercises ?? []).map((e) => e.name);
  const lastWeights: Record<string, number> = {};
  if (names.length) {
    const { data } = await supabase
      .from("workout_sets")
      .select("exercise, weight_lb, created_at")
      .in("exercise", names)
      .not("weight_lb", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);
    for (const r of data ?? []) {
      if (!(r.exercise in lastWeights) && r.weight_lb !== null) lastWeights[r.exercise] = Number(r.weight_lb);
    }
  }

  return <AssistantLoader workout={w} lastWeights={lastWeights} />;
}

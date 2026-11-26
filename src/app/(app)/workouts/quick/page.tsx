import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { btnPrimary } from "@/components/ui";
import { STAPLES, recentNames } from "@/lib/quick-start";
import { startQuickWorkout } from "../actions";
import { HourField } from "./hour-field";
import { QuickPicker } from "./picker";

export default async function QuickStartPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("workout_sets").select("exercise").order("created_at", { ascending: false }).limit(300);
  const recent = recentNames(data ?? []);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href="/workouts" className="text-sm text-zinc-400">
        &larr; Training
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Quick start</h1>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}

      <form action={startQuickWorkout} className="mt-5 space-y-2">
        <input type="hidden" name="mode" value="empty" />
        <HourField />
        <button type="submit" className={`${btnPrimary} w-full`}>
          Start an empty workout
        </button>
      </form>
      <form action={startQuickWorkout} className="mt-2">
        <input type="hidden" name="mode" value="repeat" />
        <HourField />
        <button type="submit" className="w-full rounded-xl border border-zinc-700 px-4 py-3 font-medium text-zinc-200 active:bg-zinc-800">
          Repeat my last lifting workout
        </button>
      </form>

      <h2 className="mt-8 text-sm font-medium uppercase tracking-widest text-zinc-500">Or pick exercises</h2>
      <QuickPicker recent={recent} staples={STAPLES} />
    </main>
  );
}

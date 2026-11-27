import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { CoachChat } from "./chat";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function CoachPage({ searchParams }: { searchParams: Promise<{ q?: string; w?: string }> }) {
  const { supabase } = await requireUser();
  const { q, w } = await searchParams;
  const { data: log } = await supabase.from("coach_actions").select("id,summary,status,result,created_at").neq("status", "proposed").order("created_at", { ascending: false }).limit(15).returns<{ id: string; summary: string; status: string; result: string | null; created_at: string }[]>();
  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href="/dashboard" className="text-sm text-zinc-400">
        &larr; Home
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Coach</h1>
      <p className="mt-1 text-sm text-zinc-500">Answers come from your own logs. It can also propose changes (move a workout, log food or water, a check-in...), but nothing changes until you confirm, and you can undo it.</p>
      <CoachChat key={`${q ?? ""}${w ?? ""}`} initialQuestion={q?.slice(0, 300)} workoutId={w && UUID.test(w) ? w : undefined} />
      <section className="mt-8" aria-label="Coach action log">
        <h2 className="text-sm font-medium text-zinc-300">What the coach changed</h2>
        {!log?.length ? (
          <p className="mt-2 text-sm text-zinc-500">Nothing yet. Every change the coach makes is listed here.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {log.map((a) => (
              <li key={a.id} className="rounded-xl border border-zinc-800 px-3 py-2">
                <p className="text-zinc-200">{a.summary}</p>
                <p className="text-xs text-zinc-500">
                  {a.status}
                  {a.result ? `: ${a.result}` : ""} · {a.created_at.slice(0, 10)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

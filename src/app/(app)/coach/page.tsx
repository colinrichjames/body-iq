import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { CoachChat } from "./chat";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function CoachPage({ searchParams }: { searchParams: Promise<{ q?: string; w?: string }> }) {
  await requireUser();
  const { q, w } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href="/dashboard" className="text-sm text-zinc-400">
        &larr; Home
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Coach</h1>
      <p className="mt-1 text-sm text-zinc-500">Answers come from your own logs. It can&apos;t change anything yet.</p>
      <CoachChat key={`${q ?? ""}${w ?? ""}`} initialQuestion={q?.slice(0, 300)} workoutId={w && UUID.test(w) ? w : undefined} />
    </main>
  );
}

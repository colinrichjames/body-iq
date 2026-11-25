import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found | Body IQ" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <p className="text-sm font-semibold tracking-wider text-emerald-400">BODY IQ</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">We can&apos;t find that page</h1>
      <p className="mt-2 text-zinc-400">The link may be old, or the workout, race or scan it pointed to was deleted. Your data is fine.</p>
      <div className="mt-6 grid gap-3">
        <Link href="/dashboard" className="rounded-xl bg-emerald-500 px-4 py-3 text-center font-medium text-zinc-950 active:bg-emerald-400">
          Back to dashboard
        </Link>
        <Link href="/workouts" className="rounded-xl border border-zinc-700 px-4 py-3 text-center text-zinc-200 active:bg-zinc-800">
          Go to training
        </Link>
      </div>
    </main>
  );
}

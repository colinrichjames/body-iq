import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { continueAsGuest, sendMagicLink } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; email?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/dashboard");

  const { error, sent, email } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
        Body IQ
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Train, fuel and recover with one Body IQ score.
      </h1>
      <p className="mt-3 text-zinc-400">
        Sign in with your email. We&apos;ll send you a link, no password needed.
      </p>

      {sent ? (
        <div className="mt-8 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
          <p>
            Check <span className="font-medium">{sent}</span> for your sign-in link.
          </p>
          <p className="mt-2 text-zinc-400">The link expires, so open it right away. Check spam if you don&apos;t see it.</p>
          <div className="mt-3 flex items-center gap-4">
            <form action={sendMagicLink}>
              <input type="hidden" name="email" value={sent} />
              <button type="submit" className="text-emerald-400 underline">
                Resend link
              </button>
            </form>
            <Link href="/login" className="text-zinc-400 underline">
              Wrong email?
            </Link>
          </div>
        </div>
      ) : (
        <form action={sendMagicLink} className="mt-8 space-y-3">
          <label htmlFor="email" className="sr-only">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            defaultValue={email ?? ""}
            required
            placeholder="you@example.com"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-base outline-none placeholder:text-zinc-600 focus:border-emerald-500"
          />
          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-zinc-950 active:bg-emerald-400"
          >
            Email me a sign-in link
          </button>
        </form>
      )}

      {!sent && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-zinc-600">
            <span className="h-px flex-1 bg-zinc-800" />
            or
            <span className="h-px flex-1 bg-zinc-800" />
          </div>
          <form action={continueAsGuest}>
            <button type="submit" className="w-full rounded-xl border border-zinc-700 px-4 py-3 font-medium text-zinc-200 active:bg-zinc-800">
              Continue as guest
            </button>
          </form>
          <p className="mt-2 text-xs text-zinc-500">
            No email needed. Everything works, but nothing is kept. Guest data is deleted when you tap Leave guest session, or automatically 24 hours after you start, whichever comes first. Add an email on the dashboard to keep it.
          </p>
        </>
      )}

      <p className="mt-6 text-center text-xs text-zinc-600">
        <Link href="/privacy" className="underline">
          Privacy: what Body IQ stores
        </Link>
        {" · "}
        <Link href="/terms" className="underline">
          Terms
        </Link>
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {error}
        </p>
      )}
    </main>
  );
}

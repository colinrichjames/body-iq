import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { continueAsGuest, sendMagicLink, signInWithGoogle } from "./actions";

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
        Sign in with Google, no password needed.
      </p>

      {!sent && (
        <>
          <form action={signInWithGoogle} className="mt-8">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 font-semibold text-zinc-900 active:bg-zinc-200"
            >
              <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
                <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
              </svg>
              Continue with Google
            </button>
          </form>
          <div className="my-6 flex items-center gap-3 text-xs text-zinc-600">
            <span className="h-px flex-1 bg-zinc-800" />
            or
            <span className="h-px flex-1 bg-zinc-800" />
          </div>
        </>
      )}

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
        <details className="group" open={Boolean(email) || undefined}>
        <summary className="cursor-pointer list-none text-center text-sm text-zinc-400 underline">Use an email link instead</summary>
        <form action={sendMagicLink} className="mt-4 space-y-3">
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
        </details>
      )}

      {!sent && (
        <>
          <form action={continueAsGuest} className="mt-6">
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
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {error}
        </p>
      )}
    </main>
  );
}

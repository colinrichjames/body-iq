import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { continueAsGuest, sendMagicLink } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/dashboard");

  const { error, sent } = await searchParams;

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
          Check <span className="font-medium">{sent}</span> for your sign-in link.
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
            No email needed. Everything works, but nothing is saved: your data is deleted when you leave, and after 24 hours. You can add an email from the home screen to keep it.
          </p>
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {error}
        </p>
      )}
    </main>
  );
}

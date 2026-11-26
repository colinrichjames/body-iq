import type { SupabaseClient } from "@supabase/supabase-js";

export type SyncResponse = { ok?: boolean; error?: string; days?: number; activities?: number; failed?: string[] };

/** Runs the garmin-sync Edge Function as the signed-in user. Returns an error message instead of throwing. */
export async function runGarminSync(supabase: SupabaseClient, days: number): Promise<SyncResponse | { notSignedIn: true }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { notSignedIn: true };
  let result: SyncResponse = {};
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/garmin-sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    result = (await res.json().catch(() => ({}))) as SyncResponse;
    if (!res.ok && !result.error) result.error = `Sync failed (HTTP ${res.status}).`;
  } catch {
    result = { error: "The sync took too long or couldn't be reached. Try again in a moment." };
  }
  return result;
}

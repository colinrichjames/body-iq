import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncRun } from "./types";

/** Whether Garmin is connected and the latest sync run. Never throws. */
export async function loadGarminStatus(supabase: SupabaseClient): Promise<{ connected: boolean; last: SyncRun | null }> {
  const [c, s] = await Promise.all([
    supabase.from("garmin_connections").select("user_id", { count: "exact", head: true }),
    supabase.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(1).returns<SyncRun[]>(),
  ]);
  return { connected: (c.count ?? 0) > 0, last: s.data?.[0] ?? null };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { syncFoodDay } from "./food-sync";

export type TrashKind = "workout" | "scan" | "race" | "benchmark" | "food_entry";

const KEEP_DAYS = 7;

/** Copies rows into the trash table so the delete can be undone. Returns the trash id, or null if it couldn't be saved. */
export async function toTrash(supabase: SupabaseClient, userId: string, kind: TrashKind, label: string, payload: Record<string, unknown>): Promise<string | null> {
  await supabase.from("trash").delete().lt("created_at", new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString());
  const { data, error } = await supabase.from("trash").insert({ user_id: userId, kind, label: label.slice(0, 120), payload }).select("id").single<{ id: string }>();
  return error ? null : (data?.id ?? null);
}

/** Query string that makes the undo banner appear on the next page. */
export const undoParams = (id: string | null, label: string) => (id ? `undo=${id}&ul=${encodeURIComponent(label.slice(0, 80))}` : "");

/** Appends the undo params to a path that may or may not already have a query string. */
export const withUndo = (path: string, id: string | null, label: string) => {
  const q = undoParams(id, label);
  return q ? `${path}${path.includes("?") ? "&" : "?"}${q}` : path;
};

type Rows = Record<string, unknown>[];

/** Puts a trashed item back. Returns where to send the user, or an error message. */
export async function restoreFromTrash(supabase: SupabaseClient, userId: string, id: string): Promise<{ to: string } | { error: string }> {
  const { data: t } = await supabase.from("trash").select("*").eq("id", id).maybeSingle<{ id: string; kind: TrashKind; payload: Record<string, unknown> }>();
  if (!t) return { error: "That item can't be restored any more." };
  const p = t.payload;
  const insert = async (table: string, rows: Rows | Record<string, unknown> | undefined) => {
    const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
    if (!list.length) return null;
    const { error } = await supabase.from(table).insert(list);
    return error ? error.message : null;
  };

  let err: string | null = null;
  let to = "/dashboard";
  switch (t.kind) {
    case "workout": {
      err = await insert("workouts", p.workout as Record<string, unknown>);
      if (!err) err = await insert("workout_sets", p.sets as Rows);
      to = `/workouts/${(p.workout as { id: string }).id}`;
      break;
    }
    case "scan":
      err = await insert("body_scans", p.scan as Record<string, unknown>);
      to = "/scans";
      break;
    case "race": {
      err = await insert("races", p.race as Record<string, unknown>);
      if (!err) err = await insert("workouts", p.workouts as Rows);
      to = "/races";
      break;
    }
    case "benchmark": {
      err = await insert("hyrox_benchmarks", p.benchmark as Record<string, unknown>);
      to = `/races/${String(p.race_id ?? "")}`;
      break;
    }
    case "food_entry": {
      const row = p.entry as { day: string };
      err = await insert("food_entries", row as Record<string, unknown>);
      if (!err) await syncFoodDay(supabase, userId, row.day);
      to = `/nutrition/log?d=${row.day}`;
      break;
    }
  }
  if (err) return { error: /duplicate key/i.test(err) ? "That item is already back." : "Couldn't restore it. Try again." };
  await supabase.from("trash").delete().eq("id", id);
  return { to };
}

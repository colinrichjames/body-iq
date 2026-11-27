"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { ActionKind } from "@/lib/coach-actions";
import type { ActionStatus } from "@/lib/coach-chat";
import { getToday } from "@/lib/today";
import { apply, revert } from "./exec";

type Row = { id: string; kind: ActionKind; summary: string; params: Record<string, unknown>; status: ActionStatus; result: string | null; undo: Record<string, unknown> | null };
export type ActionResult = { ok: boolean; status: ActionStatus; message: string };

async function load(id: string) {
  const ctx = await requireUser();
  const { data } = await ctx.supabase.from("coach_actions").select("id,kind,summary,params,status,result,undo").eq("id", id).maybeSingle<Row>();
  return { ...ctx, row: data };
}

/**
 * Confirms a proposed action. What runs is the proposal saved on the server, never what the client sends, and it is
 * validated again with the same rules as the screens. A failed action changes nothing and is logged as failed.
 */
export async function confirmAction(id: string): Promise<ActionResult> {
  const { supabase, userId, row } = await load(String(id));
  if (!row) return { ok: false, status: "failed", message: "I can't find that action any more." };
  if (row.status !== "proposed") return { ok: false, status: row.status, message: `That action is already ${row.status}.` };
  const now = new Date().toISOString();
  try {
    const out = await apply(supabase, userId, row.kind, row.params, await getToday());
    await supabase.from("coach_actions").update({ status: "applied", result: out.message, undo: out.undo, resolved_at: now }).eq("id", row.id);
    revalidatePath("/", "layout");
    return { ok: true, status: "applied", message: out.message };
  } catch (e) {
    const message = e instanceof Error ? e.message : "That didn't work.";
    await supabase.from("coach_actions").update({ status: "failed", result: message, resolved_at: now }).eq("id", row.id);
    return { ok: false, status: "failed", message: `${message} Nothing was changed.` };
  }
}

export async function dismissAction(id: string): Promise<ActionResult> {
  const { supabase, row } = await load(String(id));
  if (!row || row.status !== "proposed") return { ok: false, status: row?.status ?? "failed", message: "That action can't be dismissed." };
  await supabase.from("coach_actions").update({ status: "dismissed", resolved_at: new Date().toISOString() }).eq("id", row.id);
  return { ok: true, status: "dismissed", message: "Dismissed. Nothing changed." };
}

export async function undoAction(id: string): Promise<ActionResult> {
  const { supabase, userId, row } = await load(String(id));
  if (!row || row.status !== "applied" || !row.undo) return { ok: false, status: row?.status ?? "failed", message: "That action can't be undone." };
  try {
    const message = await revert(supabase, userId, row.kind, row.undo);
    await supabase.from("coach_actions").update({ status: "undone", resolved_at: new Date().toISOString() }).eq("id", row.id);
    revalidatePath("/", "layout");
    return { ok: true, status: "undone", message: `Undone. ${message}` };
  } catch (e) {
    return { ok: false, status: "applied", message: `${e instanceof Error ? e.message : "Couldn't undo."} It's still applied.` };
  }
}

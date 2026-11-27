"use server";

import { requireUser } from "@/lib/auth";
import type { ActionCard, Reply } from "@/lib/coach-chat";
import { isMonday } from "@/lib/weekly-review";
import { getToday } from "@/lib/today";
import { downgradeCard, findDowngrade, loadReview, offerText } from "./offers";

export type Proactive = { kind: "readiness" | "weekly_review"; reply: Reply };

/** Refreshes the saved cards' status so a card already confirmed or dismissed doesn't show buttons again. */
async function fresh(db: Awaited<ReturnType<typeof requireUser>>["supabase"], reply: Reply): Promise<Reply> {
  const ids = (reply.actions ?? []).map((a) => a.id);
  if (!ids.length) return reply;
  const { data } = await db.from("coach_actions").select("id,status,result").in("id", ids);
  const by = new Map((data ?? []).map((r) => [r.id as string, r as { status: ActionCard["status"]; result: string | null }]));
  return { ...reply, actions: reply.actions!.map((a) => ({ ...a, status: by.get(a.id)?.status ?? a.status, result: by.get(a.id)?.result ?? a.result })) };
}

/**
 * The coach's one unprompted message for today, or null when there's nothing real to say. At most one per day: it is
 * saved on first use (the table has one row per user per day) and every later call returns that same message.
 * Priority: red readiness with a hard session waiting, then Monday's weekly review, then amber readiness with a hard session.
 */
export async function getProactive(): Promise<Proactive | null> {
  try {
    const { supabase: db, userId } = await requireUser();
    const today = await getToday();
    const saved = async () => {
      const { data } = await db.from("coach_proactive").select("kind,reply").eq("day", today).maybeSingle<{ kind: Proactive["kind"]; reply: Reply }>();
      return data ? { kind: data.kind, reply: await fresh(db, data.reply) } : null;
    };
    const existing = await saved();
    if (existing) return existing;

    const down = await findDowngrade(db, today);
    let pick: Proactive | null = null;

    const readinessMsg = async (): Promise<Proactive | null> => {
      if (!down) return null;
      const card = await downgradeCard(db, down);
      if (!card) return null;
      return { kind: "readiness", reply: { text: offerText(down), lines: down.readiness.reasons, actions: [card] } };
    };

    if (down?.readiness.status === "red") pick = await readinessMsg();
    if (!pick && isMonday(today)) {
      const reply = await loadReview(db, userId, today);
      if (reply) pick = { kind: "weekly_review", reply };
    }
    if (!pick && down?.readiness.status === "amber") pick = await readinessMsg();
    if (!pick) return null;

    const { error } = await db.from("coach_proactive").insert({ day: today, kind: pick.kind, reply: pick.reply });
    if (error) return await saved(); // another request saved today's message first: that one is the day's message
    return pick;
  } catch (e) {
    console.error("getProactive failed", e);
    return null;
  }
}

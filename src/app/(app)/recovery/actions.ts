"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { getToday } from "@/lib/today";
import { parseCheckin } from "@/lib/checkin";
import { dbError } from "@/lib/db-error";

const BACK = new Set(["/dashboard", "/recovery"]);

/** Saves today's check-in (one per day; saving again replaces it). */
export async function saveCheckin(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const from = String(formData.get("from") ?? "/recovery");
  const back = BACK.has(from) ? from : "/recovery";
  const parsed = parseCheckin({ sleep: formData.get("sleep_hours"), soreness: formData.get("soreness"), energy: formData.get("energy") });
  if ("error" in parsed) redirect(flash(back, parsed.error));
  const day = await getToday();
  const { error } = await supabase.from("recovery_checkins").upsert({ user_id: userId, day, ...parsed.value, updated_at: new Date().toISOString() }, { onConflict: "user_id,day" });
  if (error) redirect(flash(back, `Couldn't save your check-in. ${dbError(error)}`));
  revalidatePath("/", "layout");
  redirect(flash(back, "Check-in saved."));
}

/** Removes today's check-in. */
export async function clearCheckin(formData: FormData) {
  const { supabase } = await requireUser();
  const from = String(formData.get("from") ?? "/recovery");
  const back = BACK.has(from) ? from : "/recovery";
  const { error } = await supabase.from("recovery_checkins").delete().eq("day", await getToday());
  if (error) redirect(flash(back, `Couldn't remove it. ${dbError(error)}`));
  revalidatePath("/", "layout");
  redirect(flash(back, "Check-in removed."));
}

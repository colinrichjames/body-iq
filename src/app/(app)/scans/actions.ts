"use server";

import { flash } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { toTrash, withUndo } from "@/lib/trash";

const SOURCES = ["inbody", "dexa", "scale", "manual"] as const;

function num(value: FormDataEntryValue | null): number | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function addScan(formData: FormData) {
  const supabase = await createClient();

  const source = String(formData.get("source") ?? "inbody");
  const scannedDate = String(formData.get("scanned_at") ?? "").trim();
  const row = {
    // user_id defaults to auth.uid() in the database, and RLS enforces it.
    source: (SOURCES as readonly string[]).includes(source) ? source : "manual",
    scanned_at: scannedDate ? new Date(`${scannedDate}T12:00:00`).toISOString() : new Date().toISOString(),
    weight_lb: num(formData.get("weight_lb")),
    body_fat_pct: num(formData.get("body_fat_pct")),
    skeletal_muscle_lb: num(formData.get("skeletal_muscle_lb")),
    fat_mass_lb: num(formData.get("fat_mass_lb")),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };

  if (row.weight_lb === null && row.body_fat_pct === null && row.skeletal_muscle_lb === null) {
    redirect(`/scans?error=${encodeURIComponent("Enter at least weight, body fat % or muscle mass.")}`);
  }

  const { error } = await supabase.from("body_scans").insert(row);
  if (error) {
    redirect(`/scans?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect(flash("/scans", "Scan saved."));
}

export async function deleteScan(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, userId } = await requireUser();
  const { data: scan } = await supabase.from("body_scans").select("*").eq("id", id).maybeSingle<{ scanned_at: string }>();
  const undo = scan ? await toTrash(supabase, userId, "scan", `Scan ${scan.scanned_at.slice(0, 10)}`, { scan }) : null;
  const { error } = await supabase.from("body_scans").delete().eq("id", id);
  if (error) {
    redirect(`/scans?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect(withUndo("/scans", undo, scan ? `Scan ${scan.scanned_at.slice(0, 10)}` : "Scan"));
}

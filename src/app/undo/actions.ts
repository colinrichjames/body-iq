"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { restoreFromTrash } from "@/lib/trash";

export async function undoDelete(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const from = String(formData.get("from") ?? "/dashboard");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(from.startsWith("/") ? from : "/dashboard");
  const res = await restoreFromTrash(supabase, userId, id);
  revalidatePath("/", "layout");
  if ("error" in res) redirect(`${from.startsWith("/") && !from.startsWith("//") ? from.split("?")[0] : "/dashboard"}?notice=${encodeURIComponent(res.error)}`);
  redirect(`${res.to}${res.to.includes("?") ? "&" : "?"}notice=${encodeURIComponent("Restored.")}`);
}

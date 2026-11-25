"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export async function saveUnits(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const unit = formData.get("unit_system") === "metric" ? "metric" : "imperial";
  const { error } = await supabase.from("profiles").upsert({ id: userId, unit_system: unit }, { onConflict: "id" });
  if (error) redirect(`/settings?error=${encodeURIComponent("Couldn't save your units. Try again.")}`);
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

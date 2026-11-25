"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

/** Turns the guest into a real account: same user id, so all data stays. Sends a confirmation link. */
export async function saveGuestAccount(formData: FormData) {
  const { supabase, isGuest } = await requireUser();
  if (!isGuest) redirect("/dashboard");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) redirect(`/dashboard?notice=${encodeURIComponent("Enter a valid email address.")}`);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${proto}://${host}/auth/confirm` });
  if (error) {
    const taken = /already|registered|exists/i.test(error.message);
    redirect(
      `/dashboard?notice=${encodeURIComponent(taken ? "That email already has an account. Sign out and use its sign-in link instead (this guest data won't carry over)." : error.message)}`,
    );
  }
  redirect(`/dashboard?notice=${encodeURIComponent(`Check ${email} and tap the link to finish saving your account.`)}`);
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyAuthError } from "@/lib/auth-errors";

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    redirect(`/login?error=${encodeURIComponent("Enter a valid email address.")}&email=${encodeURIComponent(email)}`);
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${proto}://${host}/auth/confirm` },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(friendlyAuthError(error.message, error.code))}&email=${encodeURIComponent(email)}`);
  }
  redirect(`/login?sent=${encodeURIComponent(email)}`);
}

/** Guest mode: an anonymous Supabase session, no email needed. Can be upgraded to a real account later. */
export async function continueAsGuest() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    const off = /anonymous/i.test(error.message);
    redirect(
      `/login?error=${encodeURIComponent(off ? friendlyAuthError(error.message) : friendlyAuthError(error.message, error.code))}`,
    );
  }
  redirect("/dashboard");
}

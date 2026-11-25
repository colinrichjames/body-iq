"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    redirect(`/login?error=${encodeURIComponent("Enter a valid email address.")}`);
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
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect(`/login?sent=${encodeURIComponent(email)}`);
}

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link landing route. Handles both:
 *  - token_hash + type (works when the link is opened in a different browser
 *    or in-app mail viewer than the one that requested it; needs the custom
 *    email template described in the README), and
 *  - code (the default PKCE link; only works in the same browser).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();
  let errorMessage: string | null = null;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    errorMessage = error?.message ?? null;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    errorMessage = error?.message ?? null;
  } else {
    errorMessage = "That sign-in link is missing information. Request a new one.";
  }

  if (errorMessage) {
    redirect(`/login?error=${encodeURIComponent(errorMessage)}`);
  }
  redirect("/dashboard");
}

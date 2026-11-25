import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { friendlyAuthError } from "@/lib/auth-errors";
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

  // Supabase sends an expired or used link back here with error params and no token.
  // Report that as the single error instead of also complaining the link is incomplete.
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  const providerCode = searchParams.get("error_code");

  if (providerError || providerCode) {
    errorMessage = friendlyAuthError(providerError, providerCode);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) errorMessage = friendlyAuthError(error.message, error.code);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) errorMessage = friendlyAuthError(error.message, error.code);
  } else {
    errorMessage = friendlyAuthError("missing");
  }

  if (errorMessage) {
    redirect(`/login?error=${encodeURIComponent(errorMessage)}`);
  }
  redirect("/dashboard");
}

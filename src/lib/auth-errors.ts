/** Turns provider errors into one short, actionable sentence. Never shows raw provider text. */
export function friendlyAuthError(raw: string | null | undefined, code?: string | null): string {
  const text = `${code ?? ""} ${raw ?? ""}`.toLowerCase();
  if (/rate.?limit|too many|over_email_send|over_request/.test(text)) {
    return "Too many sign-in emails. Wait about an hour, then try again.";
  }
  if (/otp_expired|expired|already been used|invalid or has expired|token has expired|invalid.*(token|link)|flow_state/.test(text)) {
    return "That sign-in link has expired or was already used. Request a new one.";
  }
  if (/anonymous/.test(text)) return "Guest mode isn't turned on yet. Use your email for now.";
  if (/invalid.*email|email.*invalid|validate email/.test(text)) return "That email address doesn't look right. Check it and try again.";
  if (/missing|incomplete/.test(text)) return "That sign-in link is incomplete. Request a new one.";
  return "Couldn't sign you in. Try again in a minute.";
}

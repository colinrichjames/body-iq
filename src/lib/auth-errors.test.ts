import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "./auth-errors";

describe("friendlyAuthError", () => {
  it("maps the email rate limit", () => {
    expect(friendlyAuthError("email rate limit exceeded")).toBe("Too many sign-in emails. Wait about an hour, then try again.");
    expect(friendlyAuthError(null, "over_email_send_rate_limit")).toMatch(/Wait about an hour/);
  });
  it("maps expired links to one message", () => {
    expect(friendlyAuthError("Email link is invalid or has expired", "otp_expired")).toMatch(/expired or was already used/);
    expect(friendlyAuthError("Token has expired or is invalid")).toMatch(/expired or was already used/);
  });
  it("never leaks unknown provider text", () => {
    expect(friendlyAuthError("some internal stack trace")).toBe("Couldn't sign you in. Try again in a minute.");
  });
});

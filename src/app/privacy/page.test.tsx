// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PrivacyPage from "./page";

afterEach(cleanup);

describe("privacy page", () => {
  it("states plainly how the Garmin key is stored and removed", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/stored as plain text in that protected table/i)).toBeTruthy();
    expect(screen.getByText(/Disconnect deletes the key from Body IQ straight away/i)).toBeTruthy();
  });
  it("is honest that whole-account deletion isn't self-serve yet", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/isn.t built yet/i)).toBeTruthy();
  });
});

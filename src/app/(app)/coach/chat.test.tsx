// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const askCoach = vi.hoisted(() => vi.fn(async (...args: unknown[]) => ({ args, text: "Nothing is planned for today.", lines: ["No upcoming sessions are scheduled."] })));
vi.mock("./actions", () => ({ askCoach }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { CoachChat } from "./chat";

beforeEach(() => {
  localStorage.clear();
  askCoach.mockClear();
});
afterEach(cleanup);

describe("CoachChat", () => {
  it("sends a typed question and shows the answer", async () => {
    render(<CoachChat />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Ask your coach"), { target: { value: "What's my workout today?" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    });
    expect(askCoach).toHaveBeenCalledWith("What's my workout today?", { workoutId: undefined });
    expect(screen.getByText("Nothing is planned for today.")).toBeTruthy();
    expect(screen.getByText("No upcoming sessions are scheduled.")).toBeTruthy();
  });

  it("answers the question that came in from another screen, once, with its session", async () => {
    render(<CoachChat initialQuestion="Tell me about this session" workoutId="abc" />);
    await act(async () => {});
    expect(askCoach).toHaveBeenCalledTimes(1);
    expect(askCoach).toHaveBeenCalledWith("Tell me about this session", { workoutId: "abc" });
  });

  it("falls back to an honest message when the server can't be reached", async () => {
    askCoach.mockRejectedValueOnce(new Error("offline"));
    render(<CoachChat />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "What's my workout today?" }));
    });
    expect(screen.getByText(/won't guess/)).toBeTruthy();
  });
});

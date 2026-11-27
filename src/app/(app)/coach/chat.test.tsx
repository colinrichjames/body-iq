// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const askCoach = vi.hoisted(() => vi.fn(async (...args: unknown[]) => ({ args, text: "Nothing is planned for today.", lines: ["No upcoming sessions are scheduled."] })));
vi.mock("./actions", () => ({ askCoach }));
const confirmAction = vi.hoisted(() => vi.fn(async (...a: string[]) => {
  void a;
  return { ok: true, status: "applied", message: "Moved to 2026-11-27." };
}));
const dismissAction = vi.hoisted(() => vi.fn(async (...a: string[]) => {
  void a;
  return { ok: true, status: "dismissed", message: "Dismissed. Nothing changed." };
}));
const undoAction = vi.hoisted(() => vi.fn(async (...a: string[]) => {
  void a;
  return { ok: true, status: "undone", message: "Undone. Moved back." };
}));
vi.mock("./confirm", () => ({ confirmAction, dismissAction, undoAction }));
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

  it("shows an action card that changes nothing until confirmed, then offers Undo", async () => {
    askCoach.mockResolvedValueOnce({ args: [], text: "Here's what I'd change.", actions: [{ id: "a1", title: "Move Easy run to Fri, Nov 27", lines: ["Thu to Fri."], status: "proposed" }] } as never);
    render(<CoachChat />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Ask your coach"), { target: { value: "move my run to friday" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    });
    expect(screen.getByText("Move Easy run to Fri, Nov 27")).toBeTruthy();
    expect(confirmAction).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    });
    expect(confirmAction).toHaveBeenCalledWith("a1");
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    });
    expect(undoAction).toHaveBeenCalledWith("a1");
    expect(screen.getByText(/Undone/)).toBeTruthy();
  });

  it("dismissing a card calls dismiss and never confirm", async () => {
    confirmAction.mockClear();
    askCoach.mockResolvedValueOnce({ args: [], text: "x", actions: [{ id: "a2", title: "Skip Easy run", lines: [], status: "proposed" }] } as never);
    render(<CoachChat />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Ask your coach"), { target: { value: "skip my run" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    });
    expect(dismissAction).toHaveBeenCalledWith("a2");
    expect(confirmAction).not.toHaveBeenCalled();
  });
});

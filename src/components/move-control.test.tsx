// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MoveControl } from "./move-control";

afterEach(cleanup);

describe("MoveControl", () => {
  it("moves a session to the chosen date using only buttons and a date field", () => {
    const onMove = vi.fn();
    render(<MoveControl title="Tempo run" current="2026-11-26" onMove={onMove} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Tempo run to another day" }));
    const input = screen.getByLabelText("New date for Tempo run");
    fireEvent.change(input, { target: { value: "2026-11-28" } });
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(onMove).toHaveBeenCalledWith("2026-11-28");
  });
  it("won't move to the same day and can be cancelled", () => {
    const onMove = vi.fn();
    render(<MoveControl title="Tempo run" current="2026-11-26" onMove={onMove} />);
    fireEvent.click(screen.getByRole("button", { name: /Move Tempo run/ }));
    expect((screen.getByRole("button", { name: "Move" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("New date for Tempo run")).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });
});

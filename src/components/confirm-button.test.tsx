// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConfirmButton } from "./confirm-button";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ConfirmButton", () => {
  it("does not submit when the user cancels", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <ConfirmButton message="Sure?">Delete</ConfirmButton>
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("submits when the user confirms", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <ConfirmButton message="Sure?">Delete</ConfirmButton>
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

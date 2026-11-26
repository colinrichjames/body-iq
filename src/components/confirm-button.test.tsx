// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConfirmButton } from "./confirm-button";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup() {
  const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
  // jsdom has no requestSubmit; route it to a submit event.
  HTMLFormElement.prototype.requestSubmit = function () {
    this.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  };
  render(
    <form onSubmit={onSubmit}>
      <ConfirmButton message="Delete this workout? This can't be undone.">Delete</ConfirmButton>
    </form>,
  );
  return onSubmit;
}

describe("ConfirmButton", () => {
  it("never calls window.confirm (it is suppressed in installed apps)", () => {
    const spy = vi.spyOn(window, "confirm");
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
  it("does not submit when the user cancels", () => {
    const onSubmit = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("does not submit just from opening the dialog", () => {
    const onSubmit = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("submits when the user confirms", () => {
    const onSubmit = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(dialog.querySelectorAll("button")[1]);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("closes on Escape without submitting", () => {
    const onSubmit = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

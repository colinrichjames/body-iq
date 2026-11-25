// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmForm } from "./confirm-form";

const setup = (day: string, answer: boolean) => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(answer);
  const action = vi.fn();
  render(
    <ConfirmForm action={action} dateField="day" existingDays={["2026-11-20"]} windowStart="2026-11-12" message="Replace {day}?">
      <input name="day" defaultValue={day} readOnly />
      <button type="submit">Save</button>
    </ConfirmForm>,
  );
  fireEvent.submit(screen.getByText("Save").closest("form")!);
  return confirm;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ConfirmForm", () => {
  it("asks with the formatted date when the day already has data", () => {
    const confirm = setup("2026-11-20", true);
    expect(confirm).toHaveBeenCalledWith("Replace Fri, Nov 20?");
  });
  it("does not ask for a fresh day", () => {
    expect(setup("2026-11-24", true)).not.toHaveBeenCalled();
  });
});

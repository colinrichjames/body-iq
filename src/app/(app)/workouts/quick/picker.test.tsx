// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../actions", () => ({ startQuickWorkout: vi.fn() }));
import { QuickPicker } from "./picker";

afterEach(cleanup);

describe("QuickPicker", () => {
  it("shows recent lifts first and builds the exercise list from taps", () => {
    const { container } = render(<QuickPicker recent={["Front Squat"]} staples={["Back Squat", "front squat"]} />);
    const chips = screen.getAllByRole("button", { pressed: false }).map((b) => b.textContent);
    expect(chips.slice(0, 2)).toEqual(["Front Squat", "Back Squat"]);
    expect(chips).not.toContain("front squat");
    fireEvent.click(screen.getByRole("button", { name: "Front Squat" }));
    fireEvent.change(screen.getByLabelText("Front Squat sets"), { target: { value: "5" } });
    const json = JSON.parse((container.querySelector('input[name="exercises_json"]') as HTMLInputElement).value);
    expect(json).toEqual([{ name: "Front Squat", sets: 5, reps: 10 }]);
    expect(screen.getByText("Start workout (1 exercise)")).toBeTruthy();
  });
  it("adds a custom exercise with Enter and removes it again", () => {
    render(<QuickPicker recent={[]} staples={[]} />);
    const input = screen.getByLabelText("Add another exercise");
    fireEvent.change(input, { target: { value: "Cable Fly" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByLabelText("Cable Fly sets")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Remove Cable Fly"));
    expect(screen.queryByLabelText("Cable Fly sets")).toBeNull();
  });
});

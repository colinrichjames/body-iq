// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/app/(app)/nutrition/coach-actions", () => ({ saveGoal: vi.fn() }));
import { GoalCard } from "./goal-card";

afterEach(cleanup);

describe("GoalCard", () => {
  it("offers all six goals with the current one selected and shows recommendations", () => {
    const { container } = render(<GoalCard goal="build_muscle" rate={0.25} weightLb={180} proteinTarget={207} />);
    const radios = [...container.querySelectorAll('input[name="goal_type"]')] as HTMLInputElement[];
    expect(radios).toHaveLength(6);
    expect(radios.find((r) => r.checked)?.value).toBe("build_muscle");
    expect(container.textContent).toContain("Recommended for build muscle");
    expect(container.textContent).toContain("131-180 g");
  });
  it("shows no recommendations before a goal is picked", () => {
    const { container } = render(<GoalCard goal={null} rate={null} weightLb={null} proteinTarget={null} />);
    expect(container.textContent).not.toContain("Recommended for");
  });
});

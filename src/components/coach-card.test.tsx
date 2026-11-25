// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/nutrition/coach-actions", () => ({ applyCoach: vi.fn(), keepTargets: vi.fn(), logWeighIn: vi.fn(), saveGoal: vi.fn() }));
import { CoachCard } from "./coach-card";
import type { CoachState } from "@/lib/coach-data";

const need: CoachState["advice"] = { status: "need_data", headline: "Log your weight to start", detail: "d", delta: 0, newCalories: null, newRestCalories: null, carbsDelta: 0 };
const state = (over: Partial<CoachState>): CoachState => ({ mode: "lose", rate: 1, trend: null, advice: need, latest: null, loggedDays: 0, lastChecked: null, recent: [], ...over });

describe("CoachCard", () => {
  it("asks for a goal when none is set", () => {
    const { container } = render(<CoachCard coach={state({ mode: null })} today="2026-11-25" from="/nutrition" />);
    expect(container.textContent).toContain("Pick a goal to start");
  });
  it("offers Apply and Keep mine when a change is due", () => {
    const advice = { status: "adjust" as const, headline: "Cut 250 calories a day less", detail: "x", delta: -250, newCalories: 2150, newRestCalories: null, carbsDelta: -62 };
    const { container } = render(<CoachCard coach={state({ advice, trend: { trendWeight: 180, ratePerWeek: 0, points: 6, spanDays: 20 } })} today="2026-11-25" from="/dashboard" />);
    expect(container.textContent).toContain("Apply");
    expect(container.textContent).toContain("Keep mine");
    expect((container.querySelector('input[name="calories"]') as HTMLInputElement).value).toBe("2150");
  });
  it("hides Apply until the weekly check-in is due again", () => {
    const advice = { status: "adjust" as const, headline: "h", detail: "x", delta: -250, newCalories: 2150, newRestCalories: null, carbsDelta: -62 };
    const { container } = render(<CoachCard coach={state({ advice, lastChecked: "2026-11-23" })} today="2026-11-25" from="/nutrition" />);
    expect(container.textContent).not.toContain("Keep mine");
  });
});

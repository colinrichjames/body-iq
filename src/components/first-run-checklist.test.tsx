// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FirstRunChecklist } from "./first-run-checklist";
import { buildChecklist } from "@/lib/checklist";

afterEach(cleanup);
const empty = { races: 0, hasTargets: false, scans: 0, workouts: 0, foodEntries: 0, garminConnected: false };

describe("FirstRunChecklist", () => {
  it("lists every step with links and a hint for the open ones", () => {
    render(<FirstRunChecklist items={buildChecklist(empty)} dismiss={async () => {}} />);
    expect(screen.getByText("0 of 5 done")).toBeTruthy();
    expect(screen.getByRole("link", { name: /add a race/i }).getAttribute("href")).toBe("/races");
    expect(screen.getByText(/builds your training plan backwards/i)).toBeTruthy();
    expect(screen.getByText("(optional)")).toBeTruthy();
  });
  it("hides hints for finished steps", () => {
    render(<FirstRunChecklist items={buildChecklist({ races: 1, hasTargets: true, scans: 1, workouts: 1, foodEntries: 1, garminConnected: false })} dismiss={async () => {}} />);
    expect(screen.queryByText(/builds your training plan backwards/i)).toBeNull();
    expect(screen.getByRole("button", { name: /hide this/i })).toBeTruthy();
  });
  it("shows an all-set state, with the optional Garmin step, once every required step is done", () => {
    render(<FirstRunChecklist items={buildChecklist({ races: 1, hasTargets: true, scans: 1, workouts: 1, foodEntries: 1, garminConnected: false })} dismiss={async () => {}} />);
    expect(screen.getByText(/You're all set up/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /connect garmin/i }).getAttribute("href")).toBe("/connect");
  });
  it("marks finished steps with a tick, not a strike-through", () => {
    const { container } = render(<FirstRunChecklist items={buildChecklist({ ...empty, races: 1 })} dismiss={async () => {}} />);
    expect(container.querySelector(".line-through")).toBeNull();
    expect(screen.getByRole("link", { name: /add a race/i }).textContent).toContain("✓");
  });
});

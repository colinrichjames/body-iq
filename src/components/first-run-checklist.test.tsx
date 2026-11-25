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
  it("hides hints for finished steps and offers Done when complete", () => {
    render(<FirstRunChecklist items={buildChecklist({ races: 1, hasTargets: true, scans: 1, workouts: 1, foodEntries: 1, garminConnected: false })} dismiss={async () => {}} />);
    expect(screen.getByText("5 of 5 done")).toBeTruthy();
    expect(screen.queryByText(/builds your training plan backwards/i)).toBeNull();
    expect(screen.getByRole("button", { name: /done, hide this/i })).toBeTruthy();
  });
});

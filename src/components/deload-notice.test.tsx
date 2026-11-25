// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeloadNotice } from "./deload-notice";
import { lowReadinessDays } from "@/lib/readiness";
import type { HealthDay } from "@/lib/types";

describe("DeloadNotice", () => {
  it("renders nothing when no deload is needed", () => {
    const { container } = render(<DeloadNotice check={{ level: "none", reasons: [], exercises: [] }} />);
    expect(container.innerHTML).toBe("");
  });
  it("shows the plan on deload and only reasons on watch", () => {
    const a = render(<DeloadNotice check={{ level: "deload", reasons: ["Squat is slipping"], exercises: ["Squat"] }} />);
    expect(a.container.textContent).toContain("Time for a deload week");
    expect(a.container.textContent).toContain("90%");
    const b = render(<DeloadNotice check={{ level: "watch", reasons: ["Squat is slipping"], exercises: ["Squat"] }} />);
    expect(b.container.textContent).toContain("Keep an eye");
  });
});

describe("lowReadinessDays", () => {
  it("is 0 with no data and counts poor days", () => {
    expect(lowReadinessDays([])).toBe(0);
    const day = (d: number, sleep: number): HealthDay => ({ user_id: "", day: `2026-11-${String(20 - d).padStart(2, "0")}`, sleep_seconds: sleep * 3600, sleep_score: null, hrv_ms: null, resting_hr: null, body_battery_max: null, body_battery_min: null, stress_avg: null, steps: null });
    const rows = [day(0, 4), day(1, 4), day(2, 8)];
    expect(lowReadinessDays(rows)).toBeGreaterThanOrEqual(2);
  });
});

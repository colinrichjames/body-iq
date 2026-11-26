// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { GarminOverview } from "./garmin-overview";
import type { Act } from "@/lib/garmin-summary";
import type { DailyHealth } from "@/lib/types";

afterEach(cleanup);
const act = (o: Partial<Act>): Act => ({ id: "1", sport: "walking", title: "Edmonds Walking", started_at: "2026-11-26T19:00:00Z", duration_sec: 6671, distance_m: 7080, avg_hr: null, ...o });
const day = (o: Partial<DailyHealth>): DailyHealth => ({ user_id: "u", day: "2026-11-26", sleep_seconds: 25200, sleep_score: 80, hrv_ms: 55, resting_hr: 50, body_battery_max: 90, body_battery_min: 20, stress_avg: 25, steps: 8915, ...o });
const base = { today: "2026-11-26", tz: "America/Los_Angeles", units: "imperial" as const };

describe("GarminOverview", () => {
  it("shows today's activity, steps, stats and the weekly rollup", () => {
    const acts = [act({}), act({ id: "2", started_at: "2026-11-24T19:00:00Z", title: null }), act({ id: "3", sport: "strength_training", started_at: "2026-11-25T19:00:00Z", distance_m: null, duration_sec: 3600 })];
    const { container } = render(<GarminOverview activities={acts} health={[day({})]} {...base} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Edmonds Walking");
    expect(text).toContain("4.4 mi");
    expect(text).toContain("1:51:11");
    expect(text).toContain("25:16 /mi");
    expect(text).toContain("8,915");
    expect(text).toContain("Resting heart rate");
    expect(text).toContain("2 Walks");
    expect(text).toContain("1 Workout");
  });
  it("says so when nothing happened today but keeps the other sections", () => {
    const { container } = render(<GarminOverview activities={[act({ started_at: "2026-11-24T19:00:00Z" })]} health={[]} {...base} />);
    expect(container.textContent).toContain("No activity yet today");
    expect(container.textContent).toContain("Last 7 Days");
    expect(container.textContent).not.toContain("At a Glance");
  });
  it("renders nothing with no data at all", () => {
    const { container } = render(<GarminOverview activities={[]} health={[]} {...base} />);
    expect(container.textContent).toBe("");
  });
});

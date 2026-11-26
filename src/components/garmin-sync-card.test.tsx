// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/app/(app)/garmin-actions", () => ({ syncAndImport: vi.fn() }));
import { GarminSyncCard } from "./garmin-sync-card";
import type { SyncRun } from "@/lib/types";

afterEach(cleanup);
const run = (o: Partial<SyncRun>): SyncRun => ({ id: "1", source: "garmin", started_at: "2026-11-20T17:00:00Z", finished_at: "2026-11-20T17:02:00Z", status: "success", items: 3, error: null, detail: null, ...o });

describe("GarminSyncCard", () => {
  it("offers Connect when Garmin isn't connected", () => {
    const { container } = render(<GarminSyncCard connected={false} last={null} tz="UTC" from="/dashboard" />);
    expect(container.querySelector('a[href="/connect"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Sync now");
  });
  it("shows the last sync time and a Sync now button", () => {
    const { container } = render(<GarminSyncCard connected last={run({})} tz="America/Los_Angeles" from="/workouts" />);
    expect(container.textContent).toContain("Last synced Nov 20, 9:02 AM");
    expect(container.textContent).toContain("Sync now");
    expect((container.querySelector('input[name="from"]') as HTMLInputElement).value).toBe("/workouts");
  });
  it("flags a failed sync", () => {
    const { container } = render(<GarminSyncCard connected last={run({ status: "error" })} tz="UTC" from="/dashboard" />);
    expect(container.textContent).toContain("failed");
  });
});

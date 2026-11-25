// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ToastProvider } from "@/components/toast";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
const reschedule = vi.fn(async () => ({ error: null }));
vi.mock("./actions", () => ({ rescheduleWorkout: (...a: unknown[]) => reschedule(...(a as [])) }));
let dropHandler: ((id: string, day: string) => void) | null = null;
vi.mock("@/components/use-drag-move", () => ({
  useDragMove: (fn: (id: string, day: string) => void) => {
    dropHandler = fn;
    return { grip: () => ({}), over: null, dragging: null, ghost: null };
  },
}));

import { WeekBoard } from "./week-board";

const days = ["2026-11-25", "2026-11-27"];
const mk = (status: string) => [{ id: "a", date: "2026-11-25", title: "Run", sport: "run", status, minutes: 30 }];
afterEach(() => {
  cleanup();
  reschedule.mockClear();
  vi.restoreAllMocks();
});

describe("moving workouts by drag", () => {
  it("asks before moving a completed workout, and cancel keeps it put", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<WeekBoard days={days} today="2026-11-25" workouts={mk("completed")} />);
    dropHandler!("a", "2026-11-27");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(String(confirm.mock.calls[0][0])).toMatch(/completed workout.*changes your history/i);
    expect(reschedule).not.toHaveBeenCalled();
  });
  it("moves after the user confirms", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<WeekBoard days={days} today="2026-11-25" workouts={mk("completed")} />);
    dropHandler!("a", "2026-11-27");
    expect(reschedule).toHaveBeenCalledWith("a", "2026-11-27");
  });
  it("planned sessions move instantly with no prompt", () => {
    const confirm = vi.spyOn(window, "confirm");
    render(<WeekBoard days={days} today="2026-11-25" workouts={mk("planned")} />);
    dropHandler!("a", "2026-11-27");
    expect(confirm).not.toHaveBeenCalled();
    expect(reschedule).toHaveBeenCalledWith("a", "2026-11-27");
  });
});

describe("fresh data and toasts", () => {
  it("shows server data again after a refresh instead of the stale local copy", () => {
    const { rerender } = render(<WeekBoard days={days} today="2026-11-25" workouts={mk("planned")} />);
    expect(screen.getByText("Run")).toBeTruthy();
    rerender(<WeekBoard days={days} today="2026-11-25" workouts={[{ id: "b", date: "2026-11-25", title: "Bike", sport: "bike", status: "planned", minutes: 40 }]} />);
    expect(screen.queryByText("Run")).toBeNull();
    expect(screen.getByText("Bike")).toBeTruthy();
  });
  it("toasts and refreshes after a move", async () => {
    render(
      <ToastProvider>
        <WeekBoard days={days} today="2026-11-25" workouts={mk("planned")} />
      </ToastProvider>,
    );
    await act(async () => dropHandler!("a", "2026-11-27"));
    expect(screen.getByText(/moved to/i)).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });
  it("toasts an error and puts the workout back when the move fails", async () => {
    reschedule.mockResolvedValueOnce({ error: "Couldn't move it." } as never);
    render(
      <ToastProvider>
        <WeekBoard days={days} today="2026-11-25" workouts={mk("planned")} />
      </ToastProvider>,
    );
    await act(async () => dropHandler!("a", "2026-11-27"));
    expect(screen.getAllByText("Couldn't move it.").length).toBeGreaterThan(0);
  });
});

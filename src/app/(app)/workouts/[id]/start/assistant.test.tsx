// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Workout } from "@/lib/types";

const saveProgress = vi.fn(async () => ({ error: null }));
const finishWorkout = vi.fn(async () => ({ error: null }));
vi.mock("../../actions", () => ({ saveProgress: (...a: unknown[]) => saveProgress(...(a as [])), finishWorkout: (...a: unknown[]) => finishWorkout(...(a as [])) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { Assistant } from "./assistant";
import { buildSteps } from "@/lib/steps";

const strength = {
  id: "w1",
  sport: "strength",
  title: "Push",
  description: null,
  status: "planned",
  structure: { exercises: [{ name: "Bench", sets: 3, reps: 8, weight_lb: 100 }, { name: "Fly", sets: 2, reps: 12 }], rest_sec: 60 },
} as unknown as Workout;

const hyrox = {
  id: "w2",
  sport: "hyrox",
  title: "Race sim",
  description: null,
  status: "planned",
  structure: { blocks: [{ name: "Run 1", detail: "1 km" }, { name: "SkiErg", detail: "1 km" }, { name: "Run 2", detail: "1 km" }] },
} as unknown as Workout;

const click = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));
const lastSave = () => (saveProgress.mock.calls.at(-1) as unknown as [{ sets: { skipped?: boolean; reps: number | null }[]; stepIndex: number; blocks: { skipped: boolean; name: string }[] }])[0];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
  localStorage.clear();
  saveProgress.mockClear();
  finishWorkout.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const mount = (w: Workout, extra: Partial<React.ComponentProps<typeof Assistant>> = {}) => render(<Assistant workout={w} lastWeights={{}} lastTime={{}} serverResume={null} {...extra} />);

describe("strength player", () => {
  it("Back from set 3 returns to set 2 with its logged values restored for editing", () => {
    mount(strength);
    // set 1: reps 8 weight 100 -> done
    click(/done set/i);
    click(/skip rest/i);
    // set 2: change reps to 6 and log
    fireEvent.change(screen.getByLabelText(/reps/i), { target: { value: "6" } });
    click(/done set/i);
    click(/skip rest/i);
    expect(screen.getByText(/set 3 of 3/i)).toBeTruthy();
    click(/‹ back/i);
    expect(screen.getByText(/set 2 of 3/i)).toBeTruthy();
    expect((screen.getByLabelText(/reps/i) as HTMLInputElement).value).toBe("6");
    expect(lastSave().sets).toHaveLength(1);
  });

  it("Skip set records an explicit skipped entry", () => {
    mount(strength);
    click(/skip set/i);
    expect(screen.getByText(/set 2 of 3/i)).toBeTruthy();
    expect(lastSave().sets[0].skipped).toBe(true);
  });

  it("Skip exercise skips the rest of that exercise and lands on the next one", () => {
    mount(strength);
    click(/skip exercise/i);
    expect(screen.getByRole("heading", { name: "Fly" })).toBeTruthy();
    expect(lastSave().sets).toHaveLength(3);
    expect(lastSave().sets.every((s) => s.skipped)).toBe(true);
  });

  it("finish summary lists skipped sets as skipped", () => {
    mount(strength);
    click(/skip exercise/i); // Bench x3 skipped
    click(/done set/i);
    click(/skip rest/i);
    click(/finish/i);
    expect(screen.getByText(/3 skipped/i)).toBeTruthy();
    expect(screen.getAllByText("skipped").length).toBeGreaterThan(0);
  });

  it("Edit last set changes the logged values from the rest screen", () => {
    mount(strength);
    click(/done set/i);
    click(/^edit$/i);
    fireEvent.change(screen.getByLabelText("Reps"), { target: { value: "5" } });
    click(/save set/i);
    expect(lastSave().sets[0].reps).toBe(5);
    expect(screen.getByText(/last set: 100 × 5/i)).toBeTruthy();
  });

  it("Pause freezes the elapsed timer and the rest countdown, and Resume continues", () => {
    mount(strength);
    click(/done set/i); // now resting 60s
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("0:50")).toBeTruthy();
    click(/^pause$/i);
    expect(screen.getByText(/paused/i)).toBeTruthy();
    const elapsedPaused = screen.getByText(/^\d+:\d\d$/).textContent;
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByText(/^\d+:\d\d$/).textContent).toBe(elapsedPaused);
    click(/resume/i);
    // rest picked up where it left off (50 s), not 20 s
    expect(screen.getByText("0:50")).toBeTruthy();
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText("0:45")).toBeTruthy();
  });
});

describe("player context", () => {
  it("shows exercise position, last time, per-dumbbell label and the overview", () => {
    mount(strength, { lastTime: { Fly: "12 × 35" } });
    expect(screen.getByText(/exercise 1 of 2 · bench/i)).toBeTruthy();
    click(/skip exercise/i);
    expect(screen.getByText(/exercise 2 of 2 · fly/i)).toBeTruthy();
    expect(screen.getByText(/last time: 12 × 35/i)).toBeTruthy();
    click(/exercise 2 of 2/i);
    expect(screen.getByText("0/2 sets")).toBeTruthy();
  });
  it("labels dumbbell weight per dumbbell", () => {
    const db = { ...strength, structure: { exercises: [{ name: "Dumbbell Fly", sets: 2, reps: 12, weight_lb: 35 }] } } as unknown as Workout;
    mount(db);
    expect(screen.getByText(/weight per dumbbell \(lb\)/i)).toBeTruthy();
  });
});

describe("rest timer", () => {
  it("auto-advances about 3 s after rest ends (default on)", () => {
    mount(strength);
    click(/done set/i);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText("Go")).toBeTruthy();
    act(() => vi.advanceTimersByTime(3_100));
    expect(screen.queryByText("Go")).toBeNull();
    expect(screen.getByText(/set 2 of 3/i)).toBeTruthy();
  });

  it("with auto-advance off, counts overtime up and waits", () => {
    localStorage.setItem("bodyiq-auto-advance-rest", "off");
    mount(strength);
    click(/done set/i);
    act(() => vi.advanceTimersByTime(67_000));
    expect(screen.getByText("+0:07")).toBeTruthy();
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByText("+0:27")).toBeTruthy();
  });

  it("uses a longer default rest between exercises than between sets", () => {
    const w = { ...strength, structure: { exercises: strength.structure!.exercises } } as unknown as Workout;
    const steps = buildSteps(w);
    expect(steps[0].restAfter).toBe(75);
    expect(steps[2].restAfter).toBe(120);
  });
});

describe("HYROX block player", () => {
  it("Skip block records it as skipped and Back returns to the previous block", () => {
    mount(hyrox);
    click(/next block/i); // Run 1 done
    click(/skip block/i); // SkiErg skipped
    expect(screen.getByRole("heading", { name: "Run 2" })).toBeTruthy();
    expect(lastSave().blocks.map((b) => `${b.name}:${b.skipped}`)).toEqual(["Run 1:false", "SkiErg:true"]);
    click(/‹ back/i);
    expect(screen.getByRole("heading", { name: "SkiErg" })).toBeTruthy();
    expect(lastSave().blocks).toHaveLength(1);
  });

  it("finish summary shows the skipped block", () => {
    mount(hyrox);
    click(/skip block/i);
    click(/next block/i);
    click(/finish/i);
    expect(screen.getByText(/1 skipped/i)).toBeTruthy();
    expect(screen.getByText("skipped")).toBeTruthy();
  });

  it("shows the numeric target and lists the split on the finish screen", () => {
    mount(hyrox, { targets: { "Run 1": 338, SkiErg: 250 }, targetRace: "HYROX Seattle" });
    expect(screen.getByText(/target 5:38 \/km/i)).toBeTruthy();
    act(() => vi.advanceTimersByTime(300_000));
    click(/next block/i);
    expect(screen.getByText(/target 4:10/i)).toBeTruthy();
    click(/next block/i);
    click(/finish/i);
    expect(screen.getByText(/5:00 \(target 5:38\)/)).toBeTruthy();
  });

  it("can be paused", () => {
    mount(hyrox);
    click(/^pause$/i);
    expect(screen.getByText(/paused/i)).toBeTruthy();
  });
});

describe("endurance finish", () => {
  const run = { id: "w3", sport: "run", title: "Easy run", description: null, status: "planned", structure: null } as unknown as Workout;
  const goFinish = () => {
    mount(run);
    click(/^finish$/i);
  };

  it("never says sets, and shows duration", () => {
    goFinish();
    expect(screen.queryByText(/sets? logged/i)).toBeNull();
    expect(screen.getByText(/elapsed/i)).toBeTruthy();
  });

  it("blocks saving an implausible pace and lets the user correct it", () => {
    goFinish();
    fireEvent.change(screen.getByLabelText("Distance"), { target: { value: "3.1" } });
    fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: "1" } });
    click(/save workout/i);
    expect(screen.getByText(/pace looks off/i)).toBeTruthy();
    expect(finishWorkout).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: "27" } });
    click(/save workout/i);
    expect(finishWorkout).toHaveBeenCalledTimes(1);
    expect((finishWorkout.mock.calls[0] as unknown as [{ distanceKm: number }])[0].distanceKm).toBeCloseTo(4.989, 3);
  });

  it("strength finish shows total volume and vs last time", () => {
    mount(strength, { lastVolume: { Bench: 700 } });
    click(/done set/i);
    click(/skip rest/i);
    click(/skip exercise/i);
    click(/skip exercise/i);
    expect(screen.getByText(/total volume 800 lb/i)).toBeTruthy();
    expect(screen.getByText(/\+100 lb vs last time/)).toBeTruthy();
  });
});

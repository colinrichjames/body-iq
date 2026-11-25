import { describe, expect, it } from "vitest";
import { dueReminders, hourIn } from "./reminders";

const base = { today: "2026-11-25", hour: 9, todays: [], caloriesToday: 0, lastScanDay: "2026-11-20" };

describe("dueReminders", () => {
  it("nudges about a planned session and a session in progress", () => {
    const r = dueReminders({ ...base, todays: [{ id: "a", title: "Push", status: "planned" }, { id: "b", title: "Run", status: "in_progress" }] });
    expect(r.map((x) => x.key)).toEqual(["resume-b", "today-a"]);
    expect(r[0].href).toBe("/workouts/b/start");
  });
  it("asks for food only in the evening and only when nothing is logged", () => {
    expect(dueReminders({ ...base, hour: 17 }).some((x) => x.key === "food")).toBe(false);
    expect(dueReminders({ ...base, hour: 19 }).some((x) => x.key === "food")).toBe(true);
    expect(dueReminders({ ...base, hour: 19, caloriesToday: 1800 }).some((x) => x.key === "food")).toBe(false);
  });
  it("suggests a scan after two weeks, never with no scans at all", () => {
    expect(dueReminders({ ...base, lastScanDay: "2026-11-11" }).find((x) => x.key === "scan")?.text).toMatch(/14 days ago/);
    expect(dueReminders({ ...base, lastScanDay: "2026-11-12" }).some((x) => x.key === "scan")).toBe(false);
    expect(dueReminders({ ...base, lastScanDay: null }).some((x) => x.key === "scan")).toBe(false);
  });
});

describe("hourIn", () => {
  it("reads the hour in the given zone", () => {
    expect(hourIn("America/Los_Angeles", new Date("2026-11-25T23:30:00Z"))).toBe(15);
    expect(hourIn("UTC", new Date("2026-11-25T00:05:00Z"))).toBe(0);
  });
});

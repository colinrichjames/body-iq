import { describe, expect, it } from "vitest";
import { buildCalendar, isClock } from "./ics";

const now = new Date("2026-11-25T12:00:00Z");

describe("buildCalendar", () => {
  it("writes a timed event with an alarm at the start, in floating local time", () => {
    const ics = buildCalendar([{ uid: "w1", date: "2026-11-27", time: "07:00", durationMin: 75, title: "Push, heavy; day", alarm: true }], now);
    expect(ics).toContain("DTSTART:20261127T070000\r\n");
    expect(ics).toContain("DTEND:20261127T081500\r\n");
    expect(ics).toContain("SUMMARY:Push\\, heavy\; day");
    expect(ics).toContain("TRIGGER:PT0S");
    expect(ics).toContain("DTSTAMP:20261125T120000Z");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("rolls an event across midnight and writes all-day events without an alarm", () => {
    const ics = buildCalendar([{ uid: "a", date: "2026-11-30", time: "23:30", durationMin: 60, title: "Late" }, { uid: "r", date: "2026-12-06", title: "Race day" }], now);
    expect(ics).toContain("DTEND:20261201T003000");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261206");
    expect(ics.match(/VALARM/g)).toBeNull();
  });
  it("folds long lines at 75 characters and escapes newlines", () => {
    const ics = buildCalendar([{ uid: "x", date: "2026-11-27", title: "T", description: `${"word ".repeat(40)}\nsecond line` }], now);
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, "")).toContain("\\nsecond line");
  });
});

describe("isClock", () => {
  it("accepts HH:MM only", () => {
    expect(isClock("07:00")).toBe(true);
    expect(isClock("24:00")).toBe(false);
    expect(isClock("7:00")).toBe(false);
  });
});

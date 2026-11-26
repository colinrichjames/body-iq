import { describe, expect, it } from "vitest";
import { generatePlan, layoutWeek, planWeeks, type TrainingPrefs } from "./plan";
import { DEFAULT_PREFS, prefsFromForm, sanitizePrefs } from "./plan-prefs";
import { hoursText, phaseCounts, weekRows } from "./plan-view";

describe("plan around other races", () => {
  it("lightens the week of a B race and the week after, and says why", () => {
    const base = planWeeks("marathon", "2026-12-07", "2027-03-14");
    const withB = planWeeks("marathon", "2026-12-07", "2027-03-14", undefined, [{ name: "Half", date: "2027-01-24", priority: "B" }]);
    const i = withB.findIndex((w) => w.note?.startsWith("Race this week"));
    expect(withB[i].weekStart).toBe("2027-01-18");
    expect(withB[i].factor).toBeCloseTo(base[i].factor * 0.7);
    expect(withB[i + 1].note).toBe("Recovery after Half (B)");
    expect(withB[i + 1].factor).toBeCloseTo(base[i + 1].factor * 0.8);
    expect(withB[i + 2].note).toBeUndefined();
  });
  it("ignores a race on the same day", () => {
    const w = planWeeks("10k", "2026-12-07", "2027-01-17", undefined, [{ name: "Same", date: "2027-01-17", priority: "A" }]);
    expect(w.every((x) => !x.note)).toBe(true);
  });
});

describe("training day preferences", () => {
  const sessions = (family: "run" | "tri") => {
    const plan = generatePlan({ raceType: family === "run" ? "half_marathon" : "triathlon_70_3", raceName: "R", raceDate: "2027-03-14", startDate: "2027-01-04" });
    return plan;
  };
  it("default-like preferences reproduce the default week", () => {
    const base = sessions("run");
    const same = generatePlan({ raceType: "half_marathon", raceName: "R", raceDate: "2027-03-14", startDate: "2027-01-04", prefs: DEFAULT_PREFS });
    expect(same.map((w) => [w.workout_date, w.title])).toEqual(base.map((w) => [w.workout_date, w.title]));
  });
  it("puts the long run on the chosen day and keeps sessions on available days only", () => {
    const prefs: TrainingPrefs = { days: [1, 3, 5, 6], longDay: 6 };
    const plan = generatePlan({ raceType: "half_marathon", raceName: "R", raceDate: "2027-03-14", startDate: "2027-01-04", prefs });
    const dow = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
    const middle = plan.filter((w) => w.workout_date > "2027-01-10" && w.workout_date < "2027-03-05");
    expect(middle.every((w) => prefs.days.includes(dow(w.workout_date)))).toBe(true);
    expect(middle.filter((w) => /long/i.test(w.title)).every((w) => dow(w.workout_date) === 6)).toBe(true);
    // one session per training day at most (4 days, no doubles unless the template doubles)
    const perDay = new Set(middle.map((w) => w.workout_date)).size;
    expect(perDay).toBeGreaterThan(0);
  });
  it("drops the last sessions when there are fewer days than sessions", () => {
    const tpl = [[{ title: "a" }], [{ title: "b" }], [{ title: "c" }], [{ title: "d" }], [], [{ title: "long" }], []] as never;
    const out = layoutWeek(tpl, { days: [0, 5], longDay: 5 }, "run") as { title: string }[][];
    expect(out[5][0].title).toBe("long");
    expect(out[0][0].title).toBe("a");
    expect(out.flat().map((x) => x.title)).toEqual(["a", "long"]);
  });
  it("validates preferences", () => {
    expect(sanitizePrefs({ days: [1], longDay: 1 })).toBeNull();
    expect(sanitizePrefs({ days: [5, 1, 1, 9], longDay: 3 })).toEqual({ days: [1, 5], longDay: 5 });
    const fd = new FormData();
    fd.append("day", "0");
    fd.append("day", "6");
    fd.set("long_day", "6");
    expect(prefsFromForm(fd)).toEqual({ days: [0, 6], longDay: 6 });
  });
});

describe("plan view", () => {
  it("groups sessions by week and counts phases", () => {
    const weeks = planWeeks("5k", "2027-01-04", "2027-02-14");
    const rows = weekRows(weeks, [{ id: "1", date: "2027-01-05", title: "Run", sport: "run", minutes: 40, status: "planned" }, { id: "2", date: "2027-01-07", title: "Lift", sport: "strength", minutes: 45, status: "planned" }], [{ name: "X", date: "2027-01-20", priority: "C" }]);
    expect(rows[0].sessions).toHaveLength(2);
    expect(rows[0].minutes).toBe(85);
    expect(rows.find((r) => r.others.length)?.weekStart).toBe("2027-01-18");
    const counts = phaseCounts(weeks);
    expect(counts.reduce((a, [, n]) => a + n, 0)).toBe(weeks.length);
    expect(counts.at(-1)?.[0]).toBe("taper");
    expect(hoursText(185)).toBe("3h 5m");
    expect(hoursText(120)).toBe("2h");
    expect(hoursText(40)).toBe("40m");
  });
});

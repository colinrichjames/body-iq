import { describe, expect, it } from "vitest";
import { comparePlans, planSummary } from "./plan-summary";

const base = { removed: 0, added: 40, skippedDays: 0, first: "2026-12-01", last: "2027-03-14", weeks: 15 };

describe("planSummary", () => {
  it("describes a new plan", () => {
    const s = planSummary(base, "built");
    expect(s).toContain("40 sessions over 15 weeks");
    expect(s).toContain("Dec 1");
  });
  it("mentions replaced and untouched days on rebuild", () => {
    const s = planSummary({ ...base, removed: 12, skippedDays: 3 }, "rebuilt");
    expect(s).toContain("Plan rebuilt: 40 sessions added, 0 moved, 0 removed");
    expect(s).toContain("Left 3 days alone");
  });
  it("is honest when nothing was added", () => {
    expect(planSummary({ ...base, added: 0, skippedDays: 5, first: null, last: null, weeks: 0 }, "built")).toContain("no sessions were added");
  });
});

describe("rebuild summary names what changed", () => {
  const old = [
    { date: "2026-11-27", title: "Upper body push" },
    { date: "2026-11-28", title: "Run 3.1" },
    { date: "2026-11-29", title: "Long run" },
    { date: "2026-12-01", title: "Intervals" },
  ];
  const next = [
    { date: "2026-11-29", title: "Long run" },
    { date: "2026-12-02", title: "Intervals" },
    { date: "2026-12-03", title: "Tempo" },
  ];
  it("splits unchanged, moved, removed and new", () => {
    const d = comparePlans(old, next);
    expect(d).toMatchObject({ added: 1, moved: 1, unchanged: 1 });
    expect(d.dropped).toEqual([old[0], old[1]]);
  });
  it("lists the removed sessions by day and title", () => {
    const d = comparePlans(old, next);
    const s = planSummary({ removed: 4, added: 3, fresh: d.added, moved: d.moved, dropped: d.dropped, skippedDays: 0, first: "2026-11-29", last: "2026-12-03", weeks: 1 }, "rebuilt");
    expect(s).toContain("1 session added, 1 moved, 2 removed");
    expect(s).toContain("Fri, Nov 27 Upper body push");
    expect(s).toContain("Sat, Nov 28 Run 3.1");
    expect(s).toContain("Undo puts them back");
  });
  it("says nothing is removed when nothing is", () => {
    const d = comparePlans(old, old);
    expect(d).toMatchObject({ added: 0, moved: 0, unchanged: 4, dropped: [] });
  });
});

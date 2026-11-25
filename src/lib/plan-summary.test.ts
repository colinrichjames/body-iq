import { describe, expect, it } from "vitest";
import { planSummary } from "./plan-summary";

const base = { removed: 0, added: 40, skippedDays: 0, first: "2026-12-01", last: "2027-03-14", weeks: 15 };

describe("planSummary", () => {
  it("describes a new plan", () => {
    const s = planSummary(base, "built");
    expect(s).toContain("40 sessions over 15 weeks");
    expect(s).toContain("Dec 1");
  });
  it("mentions replaced and untouched days on rebuild", () => {
    const s = planSummary({ ...base, removed: 12, skippedDays: 3 }, "rebuilt");
    expect(s).toContain("Replaced 12 unfinished sessions");
    expect(s).toContain("Left 3 days alone");
  });
  it("is honest when nothing was added", () => {
    expect(planSummary({ ...base, added: 0, skippedDays: 5, first: null, last: null, weeks: 0 }, "built")).toContain("no sessions were added");
  });
});

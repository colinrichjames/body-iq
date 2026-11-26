import { describe, expect, it } from "vitest";
import { adaptationOffer, trimmed, type AW } from "./missed-offer";

const today = "2026-12-02"; // Wednesday
let n = 0;
const w = (o: Partial<AW>): AW => ({ id: `w${++n}`, workout_date: today, status: "planned", title: "Run: Easy", sport: "run", race_id: "r1", planned_duration_min: 45, generated: true, ...o });
const long = (o: Partial<AW> = {}) => w({ title: "Long Run", workout_date: "2026-12-01", status: "skipped", planned_duration_min: 90, ...o });

describe("adaptationOffer", () => {
  it("is null when nothing was skipped or missed", () => {
    expect(adaptationOffer([w({})], today)).toBeNull();
  });
  it("offers to move a skipped key session to the next free day", () => {
    const o = adaptationOffer([long(), w({ workout_date: today, title: "Run: Easy" })], today)!;
    expect(o.kind).toBe("move");
    expect(o.to).toBe("2026-12-03");
  });
  it("does not move a hard session next to another hard day", () => {
    const o = adaptationOffer([long(), w({ title: "Intervals", workout_date: "2026-12-02" }), w({ title: "Easy", workout_date: "2026-12-03" })], today, { r1: "2027-05-01" })!;
    // Dec 3 is busy, Dec 4 is next to nothing hard (Dec 3 easy) so it can go there
    expect(o.kind).toBe("move");
    expect(o.to).toBe("2026-12-04");
  });
  it("offers a 10% trim of next week when there is no free day", () => {
    const busy = Array.from({ length: 6 }, (_, i) => w({ workout_date: `2026-12-0${2 + i}`, title: i === 0 ? "Run: Easy" : "Easy spin", sport: "bike" }));
    const o = adaptationOffer([long(), ...busy.slice(0, 6)], today)!;
    // Dec 2..7 are all taken
    expect(o.kind).toBe("trim");
    expect(o.trimPct).toBe(10);
    expect(o.trimIds!.length).toBeGreaterThan(0);
  });
  it("drops an easy skipped session without touching anything", () => {
    const o = adaptationOffer([w({ status: "skipped", workout_date: "2026-12-01", title: "Run: Easy" })], today)!;
    expect(o.kind).toBe("drop");
    expect(o.to).toBeUndefined();
  });
  it("leaves sessions that were merely never done to the missed-sessions card", () => {
    expect(adaptationOffer([long({ status: "planned" })], today)).toBeNull();
  });
  it("never offers again once handled, and ignores old skips, race day, mobility and hand-made sessions", () => {
    expect(adaptationOffer([long({ adaptation_handled_at: "2026-12-02T10:00:00Z" })], today)).toBeNull();
    expect(adaptationOffer([long({ workout_date: "2026-11-20" })], today)).toBeNull();
    expect(adaptationOffer([long({ title: "RACE DAY: Test" })], today)).toBeNull();
    expect(adaptationOffer([long({ sport: "mobility", title: "Mobility" })], today)).toBeNull();
    expect(adaptationOffer([long({ generated: false })], today)).toBeNull();
  });
  it("does not move a session past the race it belongs to", () => {
    const o = adaptationOffer([long()], today, { r1: "2026-12-02" })!;
    expect(o.kind).not.toBe("move");
  });
  it("picks the most important of the skipped sessions on the most recent day", () => {
    const o = adaptationOffer([w({ status: "skipped", workout_date: "2026-12-01", title: "Run: Easy" }), long()], today)!;
    expect(o.title).toBe("Long Run");
  });
});

describe("trimmed", () => {
  it("cuts by the percentage, with a floor of 10 minutes", () => {
    expect(trimmed(60, 10)).toBe(54);
    expect(trimmed(10, 10)).toBe(10);
    expect(trimmed(12, 50)).toBe(10);
  });
});

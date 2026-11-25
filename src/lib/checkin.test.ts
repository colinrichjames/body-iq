import { describe, expect, it } from "vitest";
import { parseCheckin } from "./checkin";

describe("parseCheckin", () => {
  it("accepts any one answer", () => {
    expect(parseCheckin({ sleep: "7.5", soreness: "", energy: null })).toEqual({ value: { sleep_hours: 7.5, soreness: null, energy: null } });
    expect(parseCheckin({ sleep: "", soreness: "4", energy: "2" })).toEqual({ value: { sleep_hours: null, soreness: 4, energy: 2 } });
  });
  it("rounds sleep to a tenth", () => {
    expect(parseCheckin({ sleep: "7.26", soreness: null, energy: null })).toEqual({ value: { sleep_hours: 7.3, soreness: null, energy: null } });
  });
  it("needs at least one answer", () => {
    expect(parseCheckin({ sleep: "", soreness: "", energy: "" })).toEqual({ error: "Answer at least one question." });
  });
  it("rejects values out of range", () => {
    expect(parseCheckin({ sleep: "17", soreness: null, energy: null })).toHaveProperty("error");
    expect(parseCheckin({ sleep: "-1", soreness: null, energy: null })).toHaveProperty("error");
    expect(parseCheckin({ sleep: "abc", soreness: null, energy: null })).toHaveProperty("error");
    expect(parseCheckin({ sleep: "", soreness: "6", energy: null })).toHaveProperty("error");
    expect(parseCheckin({ sleep: "", soreness: "2.5", energy: null })).toHaveProperty("error");
  });
});

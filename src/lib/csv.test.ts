import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(toCsv([{ a: 'He said "hi", ok', b: "x\ny" }])).toBe('a,b\n"He said ""hi"", ok","x\ny"');
  });
  it("writes a header even with no rows when columns are given", () => {
    expect(toCsv([], ["day", "name"])).toBe("day,name");
  });
  it("uses the given column order and ignores other fields", () => {
    expect(toCsv([{ id: "1", name: "Oats", day: "2026-11-25" }], ["day", "name"])).toBe("day,name\n2026-11-25,Oats");
  });
  it("leaves raw_json out of the default columns", () => {
    expect(toCsv([{ a: 1, raw_json: { big: true } }])).toBe("a\n1");
  });
});

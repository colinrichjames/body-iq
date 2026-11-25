import { describe, expect, it } from "vitest";
import { toCsv, withBom } from "./csv";

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
  it("keeps text that starts with = + - @ from running as a formula", () => {
    expect(toCsv([{ a: "=SUM(A1)", b: "@cmd", c: "-note", d: "+1 call" }])).toBe("a,b,c,d\n'=SUM(A1),'@cmd,'-note,'+1 call");
  });
  it("leaves real numbers alone, including negative ones", () => {
    expect(toCsv([{ a: -5, b: "-3.5", c: 0.25 }])).toBe("a,b,c\n-5,-3.5,0.25");
  });
  it("hides your user id and resume state", () => {
    expect(toCsv([{ id: "1", user_id: "u", progress: { x: 1 }, title: "Run" }])).toBe("id,title\n1,Run");
  });
  it("adds a byte order mark so Excel reads accents", () => {
    expect(withBom("a")).toBe("\uFEFFa");
  });
});

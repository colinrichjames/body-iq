// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearDraft, DRAFT_TTL_MS, hasContent, loadDraft, readFields, saveDraft, usableDraft, writeFields } from "./draft";

beforeEach(() => localStorage.clear());

describe("drafts", () => {
  it("saves, merges and clears", () => {
    saveDraft("k", { fields: { a: "1" } });
    saveDraft("k", { extra: { rows: 2 } });
    expect(loadDraft("k")).toMatchObject({ fields: { a: "1" }, extra: { rows: 2 }, submitted: false });
    clearDraft("k");
    expect(loadDraft("k")).toBeNull();
  });
  it("expires after a week", () => {
    saveDraft("k", { fields: { a: "1" } }, 1000);
    expect(loadDraft("k", 1000 + DRAFT_TTL_MS + 1)).toBeNull();
  });
  it("drops a submitted draft unless we came back with an error", () => {
    saveDraft("k", { fields: { a: "1" }, submitted: true });
    expect(usableDraft("k", true)?.fields.a).toBe("1");
    expect(usableDraft("k", false)).toBeNull();
    expect(loadDraft("k")).toBeNull();
  });
  it("reads and restores fields but never passwords or hidden values", () => {
    document.body.innerHTML = `<form><input name="a" value="x"><input name="pw" type="password" value="secret"><input name="h" type="hidden" value="j"><input name="c" type="checkbox" checked><select name="s"><option>one</option><option selected>two</option></select></form>`;
    const form = document.querySelector("form")!;
    const f = readFields(form);
    expect(f).toEqual({ a: "x", c: "on", s: "two" });
    (form.elements.namedItem("a") as HTMLInputElement).value = "";
    writeFields(form, f);
    expect((form.elements.namedItem("a") as HTMLInputElement).value).toBe("x");
  });
  it("hasContent ignores empty fields", () => {
    expect(hasContent({ a: "", c: "" })).toBe(false);
    expect(hasContent({ a: "", b: "5" })).toBe(true);
  });
});

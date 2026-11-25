// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DraftForm } from "./draft-form";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const ui = () => (
  <DraftForm action={() => {}} draftKey="t">
    <input name="title" aria-label="Title" defaultValue="" />
    <button type="submit">Save</button>
  </DraftForm>
);

describe("DraftForm", () => {
  it("restores what was typed after a reload and offers to discard", async () => {
    const first = render(ui());
    fireEvent.input(screen.getByLabelText("Title"), { target: { value: "Tempo run" } });
    first.unmount();
    render(ui());
    expect((await screen.findByLabelText("Title") as HTMLInputElement).value).toBe("Tempo run");
    expect(await screen.findByText("Restored your unsaved draft.")).toBeTruthy();
  });
  it("forgets the draft after a save that came back without an error", () => {
    const first = render(ui());
    fireEvent.input(screen.getByLabelText("Title"), { target: { value: "Tempo run" } });
    fireEvent.submit(screen.getByText("Save").closest("form")!);
    first.unmount();
    render(ui());
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("");
  });
});

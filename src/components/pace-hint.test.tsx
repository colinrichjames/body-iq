// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaceHint } from "./pace-hint";

afterEach(cleanup);

function form() {
  render(
    <form>
      <select name="sport" defaultValue="run"><option value="run">Run</option><option value="strength">Strength</option></select>
      <input name="planned_duration_min" />
      <input name="planned_distance" />
      <select name="distance_unit" defaultValue="mi"><option value="mi">mi</option><option value="km">km</option></select>
      <PaceHint />
    </form>,
  );
  const set = (n: string, v: string) => fireEvent.input(document.querySelector(`[name=${n}]`)!, { target: { value: v } });
  return set;
}

describe("PaceHint", () => {
  it("shows the pace as the user types", () => {
    const set = form();
    set("planned_duration_min", "31");
    set("planned_distance", "3.1");
    expect(screen.getByText("Pace 10:00 /mi")).toBeTruthy();
  });
  it("warns about an impossible pace before saving", () => {
    const set = form();
    set("planned_duration_min", "1");
    set("planned_distance", "3.1");
    expect(screen.getByText(/That pace looks off/)).toBeTruthy();
  });
  it("shows nothing for a non-run", () => {
    const set = form();
    fireEvent.change(document.querySelector("[name=sport]")!, { target: { value: "strength" } });
    set("planned_duration_min", "1");
    set("planned_distance", "3.1");
    expect(screen.queryByText(/pace/i)).toBeNull();
  });
});

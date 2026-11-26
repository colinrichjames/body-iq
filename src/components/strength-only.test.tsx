// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrengthOnly } from "./strength-only";

afterEach(cleanup);

const form = (initial: string) =>
  render(
    <form>
      <select name="sport" defaultValue={initial}>
        <option value="run">Run</option>
        <option value="strength">Strength</option>
        <option value="swim">Swim</option>
      </select>
      <StrengthOnly initialSport={initial}>
        <p>Exercises</p>
      </StrengthOnly>
    </form>,
  );

describe("StrengthOnly", () => {
  it("hides the exercise section for a run", () => {
    form("run");
    expect(screen.queryByText("Exercises")).toBeNull();
  });
  it("shows it for strength and follows the sport select", () => {
    form("strength");
    expect(screen.getByText("Exercises")).toBeTruthy();
    fireEvent.change(document.querySelector("select")!, { target: { value: "swim" } });
    expect(screen.queryByText("Exercises")).toBeNull();
    fireEvent.change(document.querySelector("select")!, { target: { value: "strength" } });
    expect(screen.getByText("Exercises")).toBeTruthy();
  });
});

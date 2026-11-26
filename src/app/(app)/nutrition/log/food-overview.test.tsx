// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FoodOverview } from "./food-overview";
import type { Food } from "@/lib/food";

afterEach(cleanup);

const shake: Food = { source: "off", barcode: "123456789012", name: "Ultra filtered protein shake", brand: "Nuri", servingLabel: "11 oz", calories: 150, protein_g: 30, carbs_g: 2, fat_g: 2.5, sodium_mg: 200, sugar_g: 1, fiber_g: null };
const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

const mount = (over: Partial<Parameters<typeof FoodOverview>[0]> = {}) => {
  const props = { food: shake, servings: "1", onServings: vi.fn(), meal: "breakfast", meals: MEALS, onMeal: vi.fn(), saving: false, note: null, onLog: vi.fn(), onBack: vi.fn(), ...over };
  return { props, ...render(<FoodOverview {...props} />) };
};

describe("FoodOverview", () => {
  it("shows the product, serving size and the calorie and macro summary", () => {
    const { container } = mount();
    const t = container.textContent ?? "";
    expect(t).toContain("Ultra filtered protein shake");
    expect(t).toContain("Nuri");
    expect(t).toContain("Serving Size");
    expect(t).toContain("11 oz");
    expect(t).toContain("150");
    expect(t).toContain("30 g");
    expect(t).toContain("2.5 g");
    expect(t).toContain("80%");
    expect(t).toContain("Sodium");
    expect(t).not.toContain("Fibre");
  });

  it("scales with the number of servings", () => {
    const { container } = mount({ servings: "2" });
    expect(container.textContent).toContain("300");
    expect(container.textContent).toContain("60 g");
  });

  it("has one log button, named for the meal, and goes back", () => {
    const { props } = mount();
    expect(screen.queryByRole("button", { name: "Log" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add to breakfast" }));
    expect(props.onLog).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(props.onBack).toHaveBeenCalled();
  });

  it("reports edits to servings and meal", () => {
    const { props } = mount();
    fireEvent.change(screen.getByLabelText("Number of Servings"), { target: { value: "1.5" } });
    expect(props.onServings).toHaveBeenCalledWith("1.5");
    fireEvent.change(screen.getByLabelText("Meal"), { target: { value: "dinner" } });
    expect(props.onMeal).toHaveBeenCalledWith("dinner");
  });

  it("can't log zero servings", () => {
    mount({ servings: "0" });
    expect((screen.getByRole("button", { name: "Add to breakfast" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

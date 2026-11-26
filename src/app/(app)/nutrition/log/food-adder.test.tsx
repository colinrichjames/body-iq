// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  addFoodEntries: vi.fn(async () => ({ error: null, added: 2 })),
  addFoodEntry: vi.fn(),
  copyDay: vi.fn(async () => ({ error: null, added: 3 })),
  copyMeal: vi.fn(async () => ({ error: null, added: 1 })),
  deleteSavedFood: vi.fn(),
  logSavedFood: vi.fn(async () => ({ error: null, added: 1 })),
  saveFoodSet: vi.fn(),
}));
vi.mock("./actions", () => actions);
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./scanner", () => ({ Scanner: () => null }));
import { FoodAdder } from "./food-adder";
import type { MealItem, SavedFood } from "@/lib/meals";

const item = (name: string, calories: number): MealItem => ({ name, brand: null, amount_label: null, calories, protein_g: 10, carbs_g: 20, fat_g: 5, sodium_mg: null, sugar_g: null, fiber_g: null });
const recipe: SavedFood = { id: "r1", kind: "recipe", name: "Chili", portions: 4, items: [item("Beans", 400), item("Beef", 1000)] };

const mount = () => render(<FoodAdder day="2026-11-25" recents={[item("Eggs", 150), item("Oats", 200)]} frequent={[{ item: item("Oats", 200), count: 5 }]} favourites={[{ id: "f1", kind: "favorite", name: "Protein shake", portions: 1, items: [item("Shake", 160)] }]} meals={[recipe]} />);

describe("FoodAdder tabs", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("remembers the meal picked today across a remount", () => {
    localStorage.clear();
    const first = mount();
    fireEvent.click(screen.getByRole("button", { name: "dinner" }));
    first.unmount();
    mount();
    expect(screen.getByRole("button", { name: "dinner" }).className).toContain("bg-emerald-500");
    localStorage.clear();
  });

  it("shows the five tabs", () => {
    mount();
    for (const t of ["Search", "Recent", "Frequent", "Favourites", "Meals"]) expect(screen.getByRole("tab", { name: t })).toBeTruthy();
  });

  it("adds several recent foods together", async () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "Recent" }));
    fireEvent.click(screen.getByLabelText("Select Eggs"));
    fireEvent.click(screen.getByLabelText("Select Oats"));
    fireEvent.click(screen.getByRole("button", { name: /Add 2 to/ }));
    await waitFor(() => expect(actions.addFoodEntries).toHaveBeenCalledTimes(1));
    const [day, , items] = actions.addFoodEntries.mock.calls[0] as unknown as [string, string, MealItem[]];
    expect(day).toBe("2026-11-25");
    expect(items.map((i) => i.name).sort()).toEqual(["Eggs", "Oats"]);
  });

  it("logs a recipe with the portions eaten", async () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "Meals" }));
    expect(screen.getByText(/Recipe · 4 portions · 350 cal each/)).toBeTruthy();
    fireEvent.change(screen.getByRole("spinbutton", { name: /Portions/ }), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add to / }));
    await waitFor(() => expect(actions.logSavedFood).toHaveBeenCalled());
    const args = actions.logSavedFood.mock.calls[0] as unknown as [string, string, string, number];
    expect(args[0]).toBe("r1");
    expect(args[3]).toBe(1.5);
  });

  it("copies yesterday's whole day by default", async () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "Meals" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(actions.copyDay).toHaveBeenCalledWith("2026-11-24", "2026-11-25"));
  });

  it("lists favourites", () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "Favourites" }));
    expect(screen.getByText("Protein shake")).toBeTruthy();
  });

  it("hand-add refreshes the log right away, like search-add", async () => {
    actions.addFoodEntry.mockResolvedValueOnce({ error: null });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Add by hand" }));
    fireEvent.change(screen.getByLabelText("Food name"), { target: { value: "Test banana" } });
    fireEvent.change(screen.getByLabelText("Calories"), { target: { value: "105" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add to / }));
    await waitFor(() => expect(actions.addFoodEntry).toHaveBeenCalledTimes(1));
    expect(actions.addFoodEntry.mock.calls[0][0]).toMatchObject({ name: "Test banana", calories: 105 });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  describe("live search", () => {
    const fetchMock = vi.fn();
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      fetchMock.mockReset();
      vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });
    const type = (v: string) => fireEvent.change(screen.getByLabelText("Search a food or type a barcode"), { target: { value: v } });

    it("searches while typing, without pressing Enter, after a short pause", async () => {
      fetchMock.mockResolvedValue({ json: async () => ({ foods: [{ source: "off", barcode: null, name: "Rolled oats", brand: null, servingLabel: "100 g", calories: 379, protein_g: 13, carbs_g: 67, fat_g: 6, sodium_mg: null, sugar_g: null, fiber_g: null }], warning: null }) });
      mount();
      type("oats");
      expect(fetchMock).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(400);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(String(fetchMock.mock.calls[0][0])).toContain("q=oats");
      expect(await screen.findByText("Rolled oats")).toBeTruthy();
    });

    it("runs one search for a burst of typing", async () => {
      fetchMock.mockResolvedValue({ json: async () => ({ foods: [], warning: null }) });
      mount();
      for (const v of ["oa", "oat", "oats"]) type(v);
      await vi.advanceTimersByTimeAsync(400);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    });

    it("shows a no-results state with an add-by-hand link that prefills the name", async () => {
      fetchMock.mockResolvedValue({ json: async () => ({ foods: [], warning: null }) });
      mount();
      type("zzzzqq");
      await vi.advanceTimersByTimeAsync(400);
      expect(await screen.findByText(/No foods found for/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /Add .zzzzqq. by hand/ }));
      expect((screen.getByLabelText("Food name") as HTMLInputElement).value).toBe("zzzzqq");
    });
  });
});

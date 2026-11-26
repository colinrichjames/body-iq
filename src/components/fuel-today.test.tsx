// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/nutrition/log/actions", () => ({ logYesterdayMeal: vi.fn() }));
import { FuelToday, type FuelTodayProps } from "./fuel-today";

afterEach(cleanup);

const base: FuelTodayProps = {
  day: "2026-11-25",
  today: "2026-11-25",
  finished: ["2026-11-24"],
  streak: 3,
  targets: { calories: 2750, protein: 207, carbs: 276, fat: 91 },
  totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
  meals: {},
  yesterday: { breakfast: ["Protein Bar", "Banana", "Coffee"], dinner: ["Pasta", "Salad"] },
  needsWeight: true,
};

describe("FuelToday", () => {
  it("shows the diary sections in order", () => {
    const { container } = render(<FuelToday {...base} />);
    const t = container.textContent ?? "";
    expect(t).toContain("Today");
    expect(t).toContain("2,750 left");
    for (const m of ["Breakfast", "Lunch", "Dinner", "Snacks"]) expect(t).toContain(m);
    expect(t.indexOf("Breakfast")).toBeLessThan(t.indexOf("Snacks"));
    expect(t.indexOf("Carbs")).toBeLessThan(t.indexOf("Protein"));
  });

  it("draws the week with the finished day checked and today selected", () => {
    const { container } = render(<FuelToday {...base} />);
    expect(container.querySelectorAll("ol li")).toHaveLength(7);
    expect(container.querySelector('a[aria-label*="finished"]')?.getAttribute("aria-label")).toContain("Nov 24");
    expect(container.querySelector('a[aria-current="date"]')?.getAttribute("aria-label")).toContain("Nov 25");
    expect(container.querySelector('[aria-label^="Logging streak: 3"]')).not.toBeNull();
  });

  it("offers yesterday's meal again only where there was one and nothing is logged yet", () => {
    const { container } = render(<FuelToday {...base} meals={{ breakfast: [{ name: "Oats", calories: 300 }] }} />);
    const t = container.textContent ?? "";
    expect(t).not.toContain("Log yesterday's breakfast again");
    expect(t).toContain("Log yesterday's dinner again");
    expect(t).toContain("Pasta and Salad");
    expect(t).not.toContain("Log yesterday's lunch again");
  });

  it("shows logged foods and calories, and Log links carry the meal", () => {
    const { container } = render(<FuelToday {...base} totals={{ calories: 300, protein: 10, carbs: 50, fat: 5 }} meals={{ breakfast: [{ name: "Oats", calories: 300 }] }} />);
    expect(container.textContent).toContain("Oats");
    expect(container.textContent).toContain("2,450");
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/nutrition/log?meal=breakfast#add");
    expect(hrefs).toContain("/nutrition/log#add");
  });

  it("marks calories over target", () => {
    const { container } = render(<FuelToday {...base} totals={{ calories: 3000, protein: 0, carbs: 0, fat: 0 }} />);
    expect(container.textContent).toContain("250 over");
  });

  it("hides the weigh-in banner once weighed and keeps the date on other days", () => {
    const { container } = render(<FuelToday {...base} needsWeight={false} day="2026-11-23" />);
    expect(container.textContent).not.toContain("Weigh in");
    expect(container.textContent).toContain("Mon, Nov 23");
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/nutrition/log?d=2026-11-23&meal=lunch#add");
  });
});

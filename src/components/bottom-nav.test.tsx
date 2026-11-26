// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let path = "/dashboard";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}));
import { BottomNav, isActive, NAV_ITEMS } from "./bottom-nav";

afterEach(cleanup);

describe("BottomNav", () => {
  it("has an icon and a text label on every tab, with Calendar", () => {
    path = "/dashboard";
    const { container } = render(<BottomNav />);
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Home", "Train", "Calendar", "Fuel", "Profile"]);
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(5);
    links.forEach((a) => {
      expect(a.querySelector("svg")).not.toBeNull();
      expect((a.textContent ?? "").length).toBeGreaterThan(0);
    });
  });

  it("marks only the current tab", () => {
    path = "/workouts/calendar";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Calendar" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Train" }).getAttribute("aria-current")).toBeNull();
  });

  it("keeps Train active on workout pages but not the calendar", () => {
    const train = NAV_ITEMS[1];
    expect(isActive(train, "/workouts")).toBe(true);
    expect(isActive(train, "/workouts/abc")).toBe(true);
    expect(isActive(train, "/workouts/calendar")).toBe(false);
    expect(isActive(NAV_ITEMS[2], "/workouts/calendar")).toBe(true);
    expect(isActive(NAV_ITEMS[0], "/dashboard")).toBe(true);
  });

  it("keeps Profile active on the pages inside it", () => {
    const profile = NAV_ITEMS[4];
    for (const p of ["/profile", "/races", "/races/abc", "/scans", "/settings", "/connect"]) expect(isActive(profile, p)).toBe(true);
    expect(isActive(profile, "/nutrition")).toBe(false);
  });

  it("hides during a workout", () => {
    path = "/workouts/abc/start";
    const { container } = render(<BottomNav />);
    expect(container.innerHTML).toBe("");
  });
});

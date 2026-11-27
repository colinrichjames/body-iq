"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Item = { href: string; label: string; icon: ReactNode; /** Extra path prefixes this tab owns. */ owns?: string[]; /** Paths under href that belong to another tab. */ except?: string[] };

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const NAV_ITEMS: Item[] = [
  { href: "/dashboard", label: "Home", owns: ["/coach"], icon: svg(<><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v10h13V10" /><path d="M10 20v-5h4v5" /></>) },
  { href: "/workouts", label: "Train", icon: svg(<><path d="M6.5 6.5v11M17.5 6.5v11" /><path d="M3.5 9v6M20.5 9v6" /><path d="M6.5 12h11" /></>), except: ["/workouts/calendar"] },
  { href: "/workouts/calendar", label: "Calendar", icon: svg(<><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>) },
  { href: "/nutrition", label: "Fuel", icon: svg(<><path d="M12 7c-1.5-1.8-5-1.3-5 2.8 0 4 2.5 8.2 5 8.2s5-4.2 5-8.2C17 5.7 13.5 5.2 12 7Z" /><path d="M12 7c0-1.8.9-3 2.5-3.5" /></>) },
  { href: "/profile", label: "Profile", owns: ["/races", "/scans", "/settings", "/connect"], icon: svg(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6" /></>) },
];

export function isActive(item: Pick<Item, "href" | "except" | "owns">, pathname: string): boolean {
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  if (item.except?.some(under)) return false;
  return under(item.href) || (item.owns?.some(under) ?? false);
}

/** The icon, swapped for a spinner while the tapped tab is loading. */
function Icon({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return pending ? <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" /> : <>{children}</>;
}

export function BottomNav() {
  const pathname = usePathname();
  if (/^\/workouts\/[^/]+\/start/.test(pathname)) return null;
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-10 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <ul className="pointer-events-auto mx-auto flex max-w-md gap-0.5 rounded-[28px] border border-zinc-700 bg-zinc-900/95 p-1.5 shadow-lg shadow-black/60 backdrop-blur">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item, pathname);
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-[22px] px-1 py-2 ${active ? "bg-zinc-700 text-emerald-300" : "text-zinc-300 active:bg-zinc-800"}`}
              >
                <Icon>{item.icon}</Icon>
                <span className={`text-[11px] leading-tight ${active ? "font-semibold" : "font-medium"}`}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

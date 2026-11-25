"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Home" },
  { href: "/workouts", label: "Train" },
  { href: "/races", label: "Races" },
  { href: "/nutrition", label: "Fuel" },
  { href: "/scans", label: "Body" },
];

function Pending() {
  const { pending } = useLinkStatus();
  return pending ? <span aria-hidden className="ml-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent align-middle" /> : null;
}

export function BottomNav() {
  const pathname = usePathname();
  if (/^\/workouts\/[^/]+\/start/.test(pathname)) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`block py-3.5 text-center text-sm ${active ? "font-medium text-emerald-400" : "text-zinc-400"}`}
              >
                {item.label}
                <Pending />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

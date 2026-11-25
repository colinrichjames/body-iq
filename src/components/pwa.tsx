"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { clearOffline } from "@/lib/offline";

/** Registers the service worker (production only) and shows a banner while the phone has no connection. */
export function Pwa() {
  const path = usePathname();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // Signing out lands on /login: saved pages from the account are dropped.
  useEffect(() => {
    if (path === "/login") clearOffline();
  }, [path]);

  if (!offline) return null;
  return (
    <p role="status" className="sticky top-0 z-50 bg-amber-950 px-4 py-2 text-center text-sm text-amber-200">
      You&apos;re offline. Workout sets are kept on this phone and saved when you&apos;re back online.
    </p>
  );
}

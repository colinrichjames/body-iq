"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Keeps a `tz` cookie in sync with the browser's timezone so "today" is correct server-side. */
export function TzSync() {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    const current = document.cookie.split("; ").find((c) => c.startsWith("tz="))?.slice(3);
    if (current !== encodeURIComponent(tz)) {
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }
  }, [router]);
  return null;
}

"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type ToastKind = "success" | "error";
type Toast = { id: number; message: string; kind: ToastKind };
type Ctx = { toast: (message: string, kind?: ToastKind) => void };

// Without a provider (tests, isolated components) toasts are silently dropped.
const ToastContext = createContext<Ctx>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

const LIFETIME = { success: 3500, error: 6000 } as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const next = useRef(1);
  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = next.current++;
    setItems((cur) => [...cur.slice(-2), { id, message, kind }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), LIFETIME[kind]);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-50 mx-auto flex w-full max-w-md flex-col gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto rounded-xl border px-4 py-2.5 text-sm shadow-lg ${t.kind === "error" ? "border-red-900 bg-red-950 text-red-200" : "border-emerald-800 bg-emerald-950 text-emerald-200"}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Turns ?notice=... from a server action's redirect into a toast, then removes it from the URL. */
function Flash() {
  const sp = useSearchParams();
  const path = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const notice = sp.get("notice");
  useEffect(() => {
    if (!notice) return;
    toast(notice, /couldn.t|can.t|failed|error|enter |pick /i.test(notice) ? "error" : "success");
    const rest = new URLSearchParams(sp.toString());
    rest.delete("notice");
    router.replace(rest.toString() ? `${path}?${rest}` : path, { scroll: false });
  }, [notice, path, router, sp, toast]);
  return null;
}

export function FlashToast() {
  return (
    <Suspense fallback={null}>
      <Flash />
    </Suspense>
  );
}

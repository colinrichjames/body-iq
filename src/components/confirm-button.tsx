"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * A submit button that asks first, in an in-page dialog. (window.confirm is silently suppressed in installed web apps
 * and some embedded browsers, which made every Delete look dead.) Cancel leaves everything as it was.
 */
export function ConfirmButton({
  message,
  className,
  children,
  pendingText,
  confirmLabel,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
  pendingText?: string;
  confirmLabel?: string;
}) {
  const { pending } = useFormStatus();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={trigger}
        disabled={pending}
        className={`${className ?? ""} disabled:opacity-60`}
        onClick={() => setOpen(true)}
      >
        {pending ? (pendingText ?? "Working...") : children}
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Please confirm"
            className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-zinc-100">{message}</p>
            <div className="mt-5 flex gap-3">
              <button ref={cancel} type="button" className="flex-1 rounded-xl border border-zinc-700 px-4 py-3 text-zinc-200 active:bg-zinc-800" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-medium text-white active:bg-red-700"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.form?.requestSubmit();
                }}
              >
                {confirmLabel ?? "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

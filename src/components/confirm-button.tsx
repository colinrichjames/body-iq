"use client";

import { useFormStatus } from "react-dom";

/** A submit button that asks first. Cancel leaves everything as it was. */
export function ConfirmButton({ message, className, children, pendingText }: { message: string; className?: string; children: React.ReactNode; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className ?? ""} disabled:opacity-60`}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending ? (pendingText ?? "Working...") : children}
    </button>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { undoDelete } from "@/app/undo/actions";
import { SubmitButton } from "@/components/submit-button";

/** Shows "Deleted X. Undo" after a delete redirect (?undo=<trash id>&ul=<label>). */
export function UndoBanner() {
  const sp = useSearchParams();
  const path = usePathname();
  const id = sp.get("undo");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const label = sp.get("ul") ?? "Item";
  const rest = new URLSearchParams(sp.toString());
  rest.delete("undo");
  rest.delete("ul");
  const dismiss = rest.toString() ? `${path}?${rest}` : path;
  return (
    <div role="status" className="mx-auto mt-3 flex w-full max-w-md items-center justify-between gap-3 rounded-xl border border-amber-700/50 bg-amber-950/30 px-4 py-2.5 text-sm text-amber-200">
      <span className="min-w-0 truncate">{label === "Plan sessions" ? "Plan sessions were removed." : <>Deleted &ldquo;{label}&rdquo;.</>}</span>
      <span className="flex shrink-0 items-center gap-3">
        <form action={undoDelete}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="from" value={path} />
          <SubmitButton pendingText="Restoring..." className="font-medium text-emerald-300 underline">
            Undo
          </SubmitButton>
        </form>
        <Link href={dismiss} className="text-zinc-400" aria-label="Dismiss">
          &times;
        </Link>
      </span>
    </div>
  );
}

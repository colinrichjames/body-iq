"use client";

import { DraftNotice, useFormDraft } from "@/components/use-form-draft";

/** A plain form that remembers what was typed until it saves. `draftKey` names the draft (one per form). */
export function DraftForm({ action, className, draftKey, children }: { action: (formData: FormData) => void | Promise<void>; className?: string; draftKey: string; children: React.ReactNode }) {
  const { ref, restored, onInput, onSubmit, discard } = useFormDraft(draftKey);
  return (
    <form ref={ref} action={action} className={className} onInput={onInput} onChange={onInput} onSubmit={onSubmit}>
      {restored && <DraftNotice onDiscard={discard} />}
      {children}
    </form>
  );
}

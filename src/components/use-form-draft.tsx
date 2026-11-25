"use client";

import { useEffect, useRef, useState } from "react";
import { clearDraft, hasContent, readFields, saveDraft, usableDraft, writeFields } from "@/lib/draft";

/**
 * Keeps a form's typed values in this browser so a refresh, a dropped connection or an accidental back-swipe
 * doesn't lose them. Restores on load and clears once the form saved without an error.
 */
export function useFormDraft(draftKey: string | undefined) {
  const ref = useRef<HTMLFormElement>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const form = ref.current;
    if (!draftKey || !form) return;
    const hadError = new URLSearchParams(window.location.search).has("error");
    const d = usableDraft(draftKey, hadError);
    // Defer so the first client render matches the server HTML.
    if (d && hasContent(d.fields) && writeFields(form, d.fields) > 0) queueMicrotask(() => setRestored(true));
  }, [draftKey]);

  const onInput = () => {
    if (!draftKey || !ref.current) return;
    saveDraft(draftKey, { fields: readFields(ref.current), submitted: false });
  };
  const onSubmit = () => {
    if (!draftKey || !ref.current) return;
    saveDraft(draftKey, { fields: readFields(ref.current), submitted: true });
  };
  const discard = () => {
    if (draftKey) clearDraft(draftKey);
    ref.current?.reset();
    setRestored(false);
    window.location.reload();
  };
  return { ref, restored, onInput, onSubmit, discard };
}

export function DraftNotice({ onDiscard }: { onDiscard: () => void }) {
  return (
    <p role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
      <span>Restored your unsaved draft.</span>
      <button type="button" onClick={onDiscard} className="shrink-0 underline">
        Discard
      </button>
    </p>
  );
}

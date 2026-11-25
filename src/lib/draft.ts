/**
 * Unsaved-form drafts in this browser (localStorage). Everything is wrapped in try/catch because storage can be
 * blocked or full; the app works the same without it.
 */
const PREFIX = "bodyiq:draft:";
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Draft = { savedAt: number; submitted: boolean; fields: Record<string, string>; extra?: unknown };

export function loadDraft(key: string, now = Date.now()): Draft | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d || typeof d.savedAt !== "number" || now - d.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, patch: Partial<Omit<Draft, "savedAt">>, now = Date.now()) {
  try {
    const cur = loadDraft(key, now);
    const next: Draft = { fields: {}, submitted: false, ...cur, ...patch, savedAt: now };
    localStorage.setItem(PREFIX + key, JSON.stringify(next));
  } catch {
    /* storage unavailable: no draft, no problem */
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/**
 * A draft marked "submitted" was sent to the server. If we land back on the form with an error it is still wanted;
 * otherwise the save worked and the draft is stale.
 */
export function usableDraft(key: string, hadError: boolean): Draft | null {
  const d = loadDraft(key);
  if (!d) return null;
  if (d.submitted && !hadError) {
    clearDraft(key);
    return null;
  }
  return d;
}

const SKIP = new Set(["password", "hidden", "file", "submit", "button"]);

/** Values of the form's own fields (not hidden JSON, passwords or files). */
export function readFields(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
    if (!el.name || SKIP.has(el.type)) continue;
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      if (el.type === "checkbox") out[el.name] = el.checked ? "on" : "";
      else if (el.checked) out[el.name] = el.value;
      continue;
    }
    out[el.name] = el.value;
  }
  return out;
}

export function writeFields(form: HTMLFormElement, fields: Record<string, string>): number {
  let n = 0;
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
    if (!el.name || SKIP.has(el.type) || !(el.name in fields)) continue;
    const v = fields[el.name];
    if (el instanceof HTMLInputElement && el.type === "checkbox") el.checked = v === "on";
    else if (el instanceof HTMLInputElement && el.type === "radio") el.checked = el.value === v;
    else el.value = v;
    n++;
  }
  return n;
}

/** True when the draft holds anything the user actually typed. */
export const hasContent = (fields: Record<string, string>) => Object.values(fields).some((v) => v !== "" && v !== "on");

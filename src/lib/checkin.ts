export type CheckinValue = { sleep_hours: number | null; soreness: number | null; energy: number | null };

const scale = (v: FormDataEntryValue | null | undefined): number | null | "bad" => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : "bad";
};

/** Validates a check-in. At least one answer is required; sleep is 0-16 hours, soreness and energy 1-5. */
export function parseCheckin(raw: { sleep: FormDataEntryValue | null | undefined; soreness: FormDataEntryValue | null | undefined; energy: FormDataEntryValue | null | undefined }): { value: CheckinValue } | { error: string } {
  const sleepText = raw.sleep === null || raw.sleep === undefined ? "" : String(raw.sleep).trim();
  let sleep: number | null = null;
  if (sleepText !== "") {
    sleep = Number(sleepText);
    if (!Number.isFinite(sleep) || sleep < 0 || sleep > 16) return { error: "Sleep should be between 0 and 16 hours." };
    sleep = Math.round(sleep * 10) / 10;
  }
  const soreness = scale(raw.soreness);
  const energy = scale(raw.energy);
  if (soreness === "bad" || energy === "bad") return { error: "Soreness and energy are a number from 1 to 5." };
  if (sleep === null && soreness === null && energy === null) return { error: "Answer at least one question." };
  return { value: { sleep_hours: sleep, soreness, energy } };
}

export const SORENESS_LABELS = ["None", "Mild", "Moderate", "High", "Very high"];
export const ENERGY_LABELS = ["Drained", "Low", "OK", "Good", "Great"];

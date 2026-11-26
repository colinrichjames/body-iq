"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addDays } from "@/lib/dates";
import { getToday } from "@/lib/today";
import { runGarminSync } from "@/lib/garmin-sync";

const TOKEN_URL = "https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token";
const EXPIRY_DAYS = [30, 90, 180, 365];

function back(kind: "error" | "notice", message: string): never {
  redirect(`/connect?${kind}=${encodeURIComponent(message)}`);
}

/** Checks the key against Garmin's documented token endpoint. Never logs or returns the key. */
async function verifyKey(key: string): Promise<"valid" | "invalid" | "unknown"> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: `ApiKey ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return "valid";
    if (res.status === 401 || res.status === 403) return "invalid";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export async function connectGarmin(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const key = String(formData.get("api_key") ?? "").trim();
  const days = Number(formData.get("expiry_days"));

  if (key.length < 10 || key.length > 1000 || /\s/.test(key)) back("error", "That doesn't look like a Garmin key. Paste it exactly as Garmin showed it.");
  if (!EXPIRY_DAYS.includes(days)) back("error", "Pick the expiry you chose in Garmin.");

  const result = await verifyKey(key);
  if (result === "invalid") back("error", "Garmin rejected that key. Check that you copied all of it, or create a new one.");

  const expiresOn = addDays(await getToday(), days);

  // Replace any earlier key. The credentials table is write-only for signed-in users.
  await supabase.from("garmin_credentials").delete().eq("user_id", userId);
  await supabase.from("garmin_connections").delete().eq("user_id", userId);
  const { error: credError } = await supabase.from("garmin_credentials").insert({ user_id: userId, api_key: key });
  if (credError) back("error", "Couldn't save the key. Try again.");
  const { error: connError } = await supabase
    .from("garmin_connections")
    .insert({ user_id: userId, key_last4: key.slice(-4), expires_on: expiresOn, verified: result === "valid" });
  if (connError) {
    await supabase.from("garmin_credentials").delete().eq("user_id", userId);
    back("error", "Couldn't save the connection. Try again.");
  }

  revalidatePath("/", "layout");
  back(
    "notice",
    result === "valid" ? "Garmin key verified and saved." : "Key saved, but Garmin didn't confirm it just now. It will be checked on the first sync.",
  );
}

export async function disconnectGarmin() {
  const { supabase, userId } = await requireUser();
  await supabase.from("garmin_credentials").delete().eq("user_id", userId);
  await supabase.from("garmin_connections").delete().eq("user_id", userId);
  revalidatePath("/", "layout");
  back("notice", "Garmin disconnected and the key was deleted from Body IQ. Delete it in Garmin Connect too if you won't reuse it.");
}

/** Runs the garmin-sync Edge Function as the signed-in user. */
export async function syncGarmin(formData: FormData) {
  const { supabase } = await requireUser();
  const days = Math.min(30, Math.max(1, Math.round(Number(formData.get("days")) || 7)));
  const result = await runGarminSync(supabase, days);
  if ("notSignedIn" in result) redirect("/login");

  revalidatePath("/", "layout");
  if (result.error) back("error", result.error);
  const failed = result.failed?.length ? ` Unavailable: ${result.failed.join(", ")}.` : "";
  back("notice", `Synced ${result.days ?? 0} days and ${result.activities ?? 0} activities.${failed}`);
}

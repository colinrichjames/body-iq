"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isIsoDate } from "@/lib/dates";
import { generatePlan, RACE_TYPES } from "@/lib/plan";
import { getToday } from "@/lib/today";
import type { Race, RaceType } from "@/lib/types";

function fail(message: string): never {
  redirect(`/races?error=${encodeURIComponent(message)}`);
}

/** Replaces this race's not-yet-done generated workouts from today on with a fresh plan. */
async function applyPlan(race: Race) {
  const { supabase, userId } = await requireUser();
  const today = await getToday();
  if (race.race_date < today) fail("That race date has already passed.");

  const { error: delError } = await supabase
    .from("workouts")
    .delete()
    .eq("race_id", race.id)
    .eq("generated", true)
    .eq("status", "planned")
    .gte("workout_date", today);
  if (delError) fail(delError.message);

  // Don't pile onto days where the user already has something (their own sessions or another plan).
  const { data: existing } = await supabase
    .from("workouts")
    .select("workout_date")
    .gte("workout_date", today)
    .lte("workout_date", race.race_date);
  const taken = new Set((existing ?? []).map((w) => w.workout_date as string));

  let planned;
  try {
    planned = generatePlan({
      raceType: race.race_type,
      raceName: race.name,
      raceDate: race.race_date,
      startDate: today,
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Could not generate a plan.");
  }

  const rows = planned
    .filter((w) => !taken.has(w.workout_date))
    .map((w) => ({ ...w, user_id: userId, race_id: race.id, generated: true, status: "planned" }));

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("workouts").insert(rows.slice(i, i + 200));
    if (error) fail(error.message);
  }
}

export async function addRace(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("race_type") ?? "");
  const date = String(formData.get("race_date") ?? "");
  const location = String(formData.get("location") ?? "").trim() || null;
  const goal = String(formData.get("goal") ?? "").trim() || null;

  if (!name) fail("Give the race a name.");
  if (!RACE_TYPES.some((t) => t.value === type)) fail("Pick a race type.");
  if (!isIsoDate(date)) fail("Pick the race date.");

  const { data, error } = await supabase
    .from("races")
    .insert({ user_id: userId, name, race_type: type as RaceType, race_date: date, location, goal })
    .select("*")
    .single<Race>();
  if (error || !data) fail(error?.message ?? "Could not save the race.");

  if (formData.get("generate") === "on") await applyPlan(data);

  revalidatePath("/races");
  revalidatePath("/workouts");
  revalidatePath("/dashboard");
  redirect("/races");
}

export async function regeneratePlan(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const { data } = await supabase.from("races").select("*").eq("id", id).single<Race>();
  if (!data) fail("Race not found.");
  await applyPlan(data);
  revalidatePath("/races");
  revalidatePath("/workouts");
  revalidatePath("/dashboard");
  redirect("/races");
}

export async function deleteRace(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const today = await getToday();
  // Remove the unfinished generated sessions; completed history stays (race_id becomes null).
  await supabase.from("workouts").delete().eq("race_id", id).eq("generated", true).eq("status", "planned").gte("workout_date", today);
  const { error } = await supabase.from("races").delete().eq("id", id);
  if (error) fail(error.message);
  revalidatePath("/races");
  revalidatePath("/workouts");
  revalidatePath("/dashboard");
  redirect("/races");
}

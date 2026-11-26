"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { addDays } from "@/lib/dates";
import { activityFields, planImport, titleFor, sportFor, type Act, type WorkoutLite } from "@/lib/garmin-import";
import { runGarminSync } from "@/lib/garmin-sync";
import { dateInTimeZone, getTimeZone, getToday } from "@/lib/today";

const BACK = new Set(["/dashboard", "/workouts"]);

/** Sync now: pulls the last few days from Garmin, then turns new activities into completed workouts. */
export async function syncAndImport(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const from = String(formData.get("from") ?? "/dashboard");
  const back = BACK.has(from) ? from : "/dashboard";

  const result = await runGarminSync(supabase, 3);
  if ("notSignedIn" in result) redirect("/login");
  if (result.error) redirect(flash(back, result.error));

  const tz = await getTimeZone();
  const today = await getToday();
  const since = new Date(Date.now() - 4 * 86_400_000).toISOString();
  const [{ data: acts }, { data: ws }] = await Promise.all([
    supabase.from("activities").select("id,sport,title,started_at,duration_sec,distance_m,avg_hr,avg_power").gte("started_at", since).returns<Act[]>(),
    supabase.from("workouts").select("id,workout_date,sport,status,activity_id").gte("workout_date", addDays(today, -5)).lte("workout_date", addDays(today, 1)).returns<WorkoutLite[]>(),
  ]);
  const linkedAll = await supabase.from("workouts").select("activity_id").not("activity_id", "is", null).returns<{ activity_id: string }[]>();
  const known: WorkoutLite[] = [...(ws ?? []), ...(linkedAll.data ?? []).map((r) => ({ id: "", workout_date: "", sport: "other" as const, status: "completed", activity_id: r.activity_id }))];
  const plan = planImport(acts ?? [], known, (iso) => dateInTimeZone(tz, new Date(iso)));

  const added: string[] = [];
  for (const a of plan.create) {
    const { error } = await supabase.from("workouts").insert({
      user_id: userId,
      workout_date: dateInTimeZone(tz, new Date(a.started_at)),
      sport: sportFor(a.sport),
      title: titleFor(a),
      generated: false,
      status: "completed",
      ...activityFields(a),
    });
    if (!error) added.push(`${titleFor(a)}${a.duration_sec ? ` (${Math.round(a.duration_sec / 60)} min)` : ""}`);
  }
  let linked = 0;
  for (const { workoutId, activity } of plan.attach) {
    const { error } = await supabase.from("workouts").update({ status: "completed", ...activityFields(activity) }).eq("id", workoutId);
    if (!error) linked++;
  }

  revalidatePath("/", "layout");
  const addedText = added.length ? `Added ${added.join(", ")}` : "";
  const matchText = linked ? `${addedText ? "matched" : "Matched"} ${linked} planned ${linked === 1 ? "session" : "sessions"}` : "";
  const msg = addedText || matchText ? `Synced. ${[addedText, matchText].filter(Boolean).join(" and ")}.` : "Synced. Nothing new from Garmin.";
  redirect(flash(back, msg));
}

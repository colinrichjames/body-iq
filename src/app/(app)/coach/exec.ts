import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, isIsoDate } from "@/lib/dates";
import { cleanItems, rowToItem } from "@/lib/meals";
import { syncFoodDay } from "@/lib/food-sync";
import { parseCheckin } from "@/lib/checkin";
import { sessionPaceProblem } from "@/lib/distance";
import { recordPlannedSets } from "@/lib/record-planned";
import { MEALS, type ActionKind } from "@/lib/coach-actions";
import type { Workout } from "@/lib/types";

/**
 * Applies and reverts confirmed coach actions. Every apply re-validates with the same rules as the screens (the
 * proposal is never trusted), and returns an `undo` payload so the exact change can be reverted. Plain functions
 * over a Supabase client, so they are testable and run only from the confirm server action.
 */

type P = Record<string, unknown>;
export type Applied = { message: string; undo: P };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const FOOD_COLS = "name,brand,amount_label,calories,protein_g,carbs_g,fat_g,sodium_mg,sugar_g,fiber_g";
const TARGET_COLS = ["calorie_target", "protein_target_g", "carbs_target_g", "fat_target_g", "rest_calorie_target", "rest_protein_g", "rest_carbs_g", "rest_fat_g"];

async function getWorkout(db: SupabaseClient, id: string): Promise<Workout> {
  const { data } = await db.from("workouts").select("*").eq("id", id).maybeSingle<Workout>();
  if (!data) throw new Error("That workout no longer exists.");
  return data;
}
const must = (error: { message: string } | null, what: string) => {
  if (error) throw new Error(`Couldn't ${what}.`);
};

async function moveMany(db: SupabaseClient, today: string, moves: { id: string; to: string }[]): Promise<{ id: string; from: string }[]> {
  const undo: { id: string; from: string }[] = [];
  for (const m of moves) {
    if (!isIsoDate(m.to) || m.to < today) throw new Error("I won't move a session into the past.");
    const w = await getWorkout(db, m.id);
    if (w.status === "completed") throw new Error(`${w.title} is already done, so I won't move it.`);
    const { error } = await db.from("workouts").update({ workout_date: m.to }).eq("id", m.id);
    must(error, `move ${w.title}`);
    undo.push({ id: m.id, from: w.workout_date });
  }
  return undo;
}

export async function apply(db: SupabaseClient, userId: string, kind: ActionKind, p: P, today: string): Promise<Applied> {
  switch (kind) {
    case "reschedule": {
      const undo = await moveMany(db, today, [{ id: str(p.id), to: str(p.to) }]);
      return { message: `Moved to ${str(p.to)}.`, undo: { moves: undo } };
    }
    case "swap_hard": {
      const moves = (p.moves as { id: string; to: string }[]) ?? [];
      const undo = await moveMany(db, today, moves);
      return { message: `Moved ${moves.length} session${moves.length === 1 ? "" : "s"}.`, undo: { moves: undo } };
    }
    case "shift_plan": {
      const days = Number(p.days);
      if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 60) throw new Error("That shift isn't valid.");
      const { data: race } = await db.from("races").select("id,race_date").eq("id", str(p.raceId)).maybeSingle<{ id: string; race_date: string }>();
      if (!race) throw new Error("That race no longer exists.");
      const { data } = await db.from("workouts").select("id,workout_date").eq("race_id", race.id).eq("generated", true).eq("status", "planned").gte("workout_date", today);
      const rows = (data ?? []) as { id: string; workout_date: string }[];
      if (!rows.length) throw new Error("No unfinished planned sessions to shift.");
      if (rows.some((r) => addDays(r.workout_date, days) < today || addDays(r.workout_date, days) >= race.race_date)) throw new Error("That would put sessions in the past or on race day.");
      const undo = await moveMany(db, today, rows.map((r) => ({ id: r.id, to: addDays(r.workout_date, days) })));
      return { message: `Shifted ${rows.length} sessions by ${days} day${Math.abs(days) === 1 ? "" : "s"}.`, undo: { moves: undo } };
    }
    case "skip": {
      const w = await getWorkout(db, str(p.id));
      if (w.status === "completed") throw new Error(`${w.title} is already done.`);
      const { error } = await db.from("workouts").update({ status: "skipped", progress: null, completed_at: null }).eq("id", w.id);
      must(error, "skip it");
      return { message: `Skipped ${w.title}.`, undo: { id: w.id, status: w.status, progress: w.progress ?? null, completed_at: w.completed_at ?? null } };
    }
    case "complete": {
      const w = await getWorkout(db, str(p.id));
      if (w.status === "completed") throw new Error(`${w.title} is already done.`);
      const issue = sessionPaceProblem(w.sport, w.planned_duration_min, w.planned_distance_km !== null ? Number(w.planned_distance_km) : null, w.title);
      if (issue) throw new Error(`${issue} Edit the workout first.`);
      const { count } = await db.from("workout_sets").select("id", { count: "exact", head: true }).eq("workout_id", w.id);
      const { error } = await db.from("workouts").update({ status: "completed", progress: null, completed_at: new Date().toISOString() }).eq("id", w.id);
      must(error, "mark it done");
      const extra = await recordPlannedSets(db, userId, w.id);
      return { message: `Marked ${w.title} done.${extra}`, undo: { id: w.id, status: w.status, progress: w.progress ?? null, completed_at: w.completed_at ?? null, hadSets: (count ?? 0) > 0 } };
    }
    case "swap_exercise":
    case "set_weight": {
      const w = await getWorkout(db, str(p.id));
      if (w.status === "completed") throw new Error(`${w.title} is already done, so I won't change it.`);
      const s = w.structure;
      const idx = (s?.exercises ?? []).findIndex((e) => e.name === str(kind === "set_weight" ? p.exercise : p.from));
      if (!s || idx < 0) throw new Error("That exercise isn't in the workout any more.");
      const next = { ...s, exercises: (s.exercises ?? []).map((e, i) => (i !== idx ? e : kind === "set_weight" ? { ...e, weight_lb: Number(p.weight) } : { ...e, name: str(p.to).slice(0, 80), weight_lb: undefined })) };
      if (kind === "set_weight" && !(Number(p.weight) > 0 && Number(p.weight) <= 1500)) throw new Error("That weight isn't valid.");
      const { error } = await db.from("workouts").update({ structure: JSON.parse(JSON.stringify(next)) }).eq("id", w.id);
      must(error, "change the workout");
      return { message: kind === "set_weight" ? `Set ${str(p.exercise)} to ${p.weight} lb.` : `Swapped ${str(p.from)} for ${str(p.to)}.`, undo: { id: w.id, structure: s } };
    }
    case "downgrade": {
      const w = await getWorkout(db, str(p.id));
      if (w.status !== "planned") throw new Error(`${w.title} isn't a planned session any more, so I left it alone.`);
      const minutes = p.minutes === null || p.minutes === undefined ? w.planned_duration_min : Number(p.minutes);
      const km = p.km === null || p.km === undefined ? w.planned_distance_km : Number(p.km);
      if (minutes !== null && !(minutes > 0 && minutes <= (w.planned_duration_min ?? minutes))) throw new Error("That duration isn't valid.");
      const issue = sessionPaceProblem(w.sport, minutes, km !== null ? Number(km) : null, str(p.title) || w.title);
      if (issue) throw new Error(issue);
      const { error } = await db.from("workouts").update({ title: str(p.title).slice(0, 120) || w.title, planned_duration_min: minutes, planned_distance_km: km, structure: p.structure ?? w.structure }).eq("id", w.id);
      must(error, "make it easier");
      return { message: `${w.title} is now easier.`, undo: { id: w.id, title: w.title, planned_duration_min: w.planned_duration_min, planned_distance_km: w.planned_distance_km, structure: w.structure ?? null } };
    }
    case "log_food": {
      const day = str(p.day);
      const meal = str(p.meal);
      if (!isIsoDate(day) || !(MEALS as readonly string[]).includes(meal)) throw new Error("Pick a date and meal.");
      const items = cleanItems(p.items);
      if (!items) throw new Error("Check the foods and numbers.");
      const rows = items.map((i) => ({ user_id: userId, day, meal, name: i.name.slice(0, 160), brand: i.brand?.slice(0, 120) || null, amount_label: i.amount_label?.slice(0, 60) || null, calories: i.calories, protein_g: i.protein_g, carbs_g: i.carbs_g, fat_g: i.fat_g, sodium_mg: i.sodium_mg, sugar_g: i.sugar_g, fiber_g: i.fiber_g }));
      const { data, error } = await db.from("food_entries").insert(rows).select("id");
      must(error, "log the food");
      await syncFoodDay(db, userId, day);
      return { message: `Logged ${items.length} food${items.length === 1 ? "" : "s"} to ${meal}.`, undo: { day, ids: (data ?? []).map((r: { id: string }) => r.id) } };
    }
    case "copy_meals": {
      const from = str(p.from);
      const to = str(p.to);
      const meal = p.meal ? str(p.meal) : null;
      if (!isIsoDate(from) || !isIsoDate(to) || from === to) throw new Error("Pick two different dates.");
      let q = db.from("food_entries").select(`meal,${FOOD_COLS}`).eq("day", from).in("meal", meal ? [meal] : [...MEALS]).order("created_at");
      if (meal && !(MEALS as readonly string[]).includes(meal)) throw new Error("Pick a meal.");
      q = q.neq("source", "myfitnesspal");
      const { data } = await q;
      const src = (data ?? []) as unknown as ({ meal: string } & Record<string, unknown>)[];
      if (!src.length) throw new Error(`Nothing logged ${meal ? `for ${meal} ` : ""}on that day to copy.`);
      const rows = src.map((r) => ({ user_id: userId, day: to, meal: r.meal, ...rowToItem(r as never) }));
      const { data: ins, error } = await db.from("food_entries").insert(rows).select("id");
      must(error, "copy the meals");
      await syncFoodDay(db, userId, to);
      return { message: `Copied ${rows.length} food${rows.length === 1 ? "" : "s"}.`, undo: { day: to, ids: (ins ?? []).map((r: { id: string }) => r.id) } };
    }
    case "log_water": {
      const day = str(p.day);
      const ml = Math.round(Number(p.ml));
      if (!isIsoDate(day) || !(ml > 0 && ml <= 5000)) throw new Error("That amount isn't valid.");
      const { data: cur } = await db.from("hydration_days").select("ml").eq("day", day).maybeSingle<{ ml: number }>();
      const next = Math.min(20000, (cur?.ml ?? 0) + ml);
      const { error } = await db.from("hydration_days").upsert({ user_id: userId, day, ml: next, updated_at: new Date().toISOString() }, { onConflict: "user_id,day" });
      must(error, "log water");
      return { message: `Water for ${day} is now ${next} ml.`, undo: { day, previous: cur ? cur.ml : null } };
    }
    case "set_targets": {
      const column = str(p.column);
      const value = Number(p.value);
      if (!TARGET_COLS.includes(column)) throw new Error("That target isn't valid.");
      if (!(Number.isFinite(value) && value > 0 && value < 20000)) throw new Error("Targets are between 1 and 19,999.");
      const { data: cur } = await db.from("profiles").select(column).eq("id", userId).maybeSingle();
      const previous = (cur as Record<string, unknown> | null)?.[column] ?? null;
      const { error } = await db.from("profiles").upsert({ id: userId, [column]: Math.round(value) }, { onConflict: "id" });
      must(error, "save the target");
      return { message: "Target saved.", undo: { column, previous } };
    }
    case "checkin": {
      const parsed = parseCheckin({ sleep: p.sleep_hours == null ? null : String(p.sleep_hours), soreness: p.soreness == null ? null : String(p.soreness), energy: p.energy == null ? null : String(p.energy) });
      if ("error" in parsed) throw new Error(parsed.error);
      const { data: cur } = await db.from("recovery_checkins").select("sleep_hours,soreness,energy").eq("day", today).maybeSingle();
      const { error } = await db.from("recovery_checkins").upsert({ user_id: userId, day: today, ...parsed.value, updated_at: new Date().toISOString() }, { onConflict: "user_id,day" });
      must(error, "save the check-in");
      return { message: "Check-in saved.", undo: { day: today, previous: cur ?? null } };
    }
    case "log_scan": {
      const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      const row = { source: "manual", scanned_at: new Date().toISOString(), weight_lb: n(p.weight_lb), body_fat_pct: n(p.body_fat_pct), skeletal_muscle_lb: n(p.skeletal_muscle_lb), fat_mass_lb: null, notes: "Logged via coach" };
      if (row.weight_lb === null && row.body_fat_pct === null && row.skeletal_muscle_lb === null) throw new Error("Enter at least weight, body fat % or muscle mass.");
      if (row.weight_lb !== null && !(row.weight_lb >= 40 && row.weight_lb <= 800)) throw new Error("That weight looks off.");
      if (row.body_fat_pct !== null && !(row.body_fat_pct >= 2 && row.body_fat_pct <= 70)) throw new Error("That body fat % looks off.");
      const { data, error } = await db.from("body_scans").insert(row).select("id").maybeSingle<{ id: string }>();
      must(error, "save the scan");
      return { message: "Scan saved.", undo: { id: data?.id ?? null } };
    }
  }
}

export async function revert(db: SupabaseClient, userId: string, kind: ActionKind, u: P): Promise<string> {
  switch (kind) {
    case "reschedule":
    case "swap_hard":
    case "shift_plan": {
      for (const m of (u.moves as { id: string; from: string }[]) ?? []) {
        const { error } = await db.from("workouts").update({ workout_date: m.from }).eq("id", m.id);
        must(error, "move a session back");
      }
      return "Moved back.";
    }
    case "skip":
    case "complete": {
      if (kind === "complete" && u.hadSets === false) await db.from("workout_sets").delete().eq("workout_id", str(u.id));
      const { error } = await db.from("workouts").update({ status: u.status, progress: u.progress ?? null, completed_at: u.completed_at ?? null }).eq("id", str(u.id));
      must(error, "restore the workout");
      return "Restored.";
    }
    case "swap_exercise":
    case "set_weight": {
      const { error } = await db.from("workouts").update({ structure: u.structure }).eq("id", str(u.id));
      must(error, "restore the workout");
      return "Restored.";
    }
    case "downgrade": {
      const { error } = await db.from("workouts").update({ title: u.title, planned_duration_min: u.planned_duration_min, planned_distance_km: u.planned_distance_km, structure: u.structure }).eq("id", str(u.id));
      must(error, "restore the workout");
      return "Restored.";
    }
    case "log_food":
    case "copy_meals": {
      const ids = (u.ids as string[]) ?? [];
      if (ids.length) {
        const { error } = await db.from("food_entries").delete().in("id", ids);
        must(error, "remove the foods");
      }
      await syncFoodDay(db, userId, str(u.day));
      return "Removed.";
    }
    case "log_water": {
      const day = str(u.day);
      if (u.previous === null) await db.from("hydration_days").delete().eq("day", day);
      else {
        const { error } = await db.from("hydration_days").upsert({ user_id: userId, day, ml: Number(u.previous), updated_at: new Date().toISOString() }, { onConflict: "user_id,day" });
        must(error, "restore water");
      }
      return "Restored.";
    }
    case "set_targets": {
      const { error } = await db.from("profiles").upsert({ id: userId, [str(u.column)]: u.previous ?? null }, { onConflict: "id" });
      must(error, "restore the target");
      return "Restored.";
    }
    case "checkin": {
      const day = str(u.day);
      if (!u.previous) await db.from("recovery_checkins").delete().eq("day", day);
      else {
        const { error } = await db.from("recovery_checkins").upsert({ user_id: userId, day, ...(u.previous as object), updated_at: new Date().toISOString() }, { onConflict: "user_id,day" });
        must(error, "restore the check-in");
      }
      return "Restored.";
    }
    case "log_scan": {
      if (u.id) {
        const { error } = await db.from("body_scans").delete().eq("id", str(u.id));
        must(error, "remove the scan");
      }
      return "Removed.";
    }
  }
}

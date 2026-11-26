"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addDays, isIsoDate } from "@/lib/dates";
import { getToday } from "@/lib/today";
import { syncFoodDay } from "@/lib/food-sync";
import { toTrash, withUndo } from "@/lib/trash";
import { cleanItems, entriesFor, rowToItem, type MealItem, type SavedKind } from "@/lib/meals";
import { flash } from "@/lib/flash";

const MEALS = ["breakfast", "lunch", "dinner", "snack"];

export type FoodEntryInput = {
  day: string;
  meal: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  amountLabel?: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sodium_mg?: number | null;
  sugar_g?: number | null;
  fiber_g?: number | null;
  /** Remember this food (with its barcode) for next time. */
  saveCustom?: { servingLabel: string; perServing: { calories: number; protein_g: number; carbs_g: number; fat_g: number } } | null;
};

const ok = (v: unknown, max = 20000) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < max;
const opt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 100000 ? v : null);

async function syncDay(day: string) {
  const { supabase, userId } = await requireUser();
  await syncFoodDay(supabase, userId, day);
}

function refresh(day: string) {
  revalidatePath("/", "layout");
  void day;
}

export async function addFoodEntry(input: FoodEntryInput): Promise<{ error: string | null }> {
  const { supabase, userId } = await requireUser();
  const name = (input.name ?? "").trim();
  if (!isIsoDate(input.day)) return { error: "Pick a date." };
  if (!MEALS.includes(input.meal)) return { error: "Pick a meal." };
  if (!name) return { error: "Give the food a name." };
  if (!ok(input.calories) || !ok(input.protein_g) || !ok(input.carbs_g) || !ok(input.fat_g)) return { error: "Check the numbers." };

  const { error } = await supabase.from("food_entries").insert({
    user_id: userId,
    day: input.day,
    meal: input.meal,
    name: name.slice(0, 160),
    brand: input.brand?.slice(0, 120) || null,
    barcode: input.barcode && /^\d{6,14}$/.test(input.barcode) ? input.barcode : null,
    amount_label: input.amountLabel?.slice(0, 60) || null,
    calories: input.calories,
    protein_g: input.protein_g,
    carbs_g: input.carbs_g,
    fat_g: input.fat_g,
    sodium_mg: opt(input.sodium_mg),
    sugar_g: opt(input.sugar_g),
    fiber_g: opt(input.fiber_g),
  });
  if (error) return { error: error.message };

  if (input.saveCustom && ok(input.saveCustom.perServing.calories)) {
    const p = input.saveCustom.perServing;
    const barcode = input.barcode && /^\d{6,14}$/.test(input.barcode) ? input.barcode : null;
    const row = {
      user_id: userId,
      barcode,
      name: name.slice(0, 160),
      brand: input.brand?.slice(0, 120) || null,
      serving_label: input.saveCustom.servingLabel.slice(0, 60) || "1 serving",
      calories: p.calories,
      protein_g: p.protein_g,
      carbs_g: p.carbs_g,
      fat_g: p.fat_g,
    };
    // Best effort: a duplicate barcode just keeps the first copy.
    if (barcode) await supabase.from("custom_foods").upsert(row, { onConflict: "user_id,barcode", ignoreDuplicates: true });
    else await supabase.from("custom_foods").insert(row);
  }

  await syncDay(input.day);
  refresh(input.day);
  return { error: null };
}

export async function deleteFoodEntry(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const day = String(formData.get("day") ?? "");
  const { data: entry } = await supabase.from("food_entries").select("*").eq("id", id).maybeSingle<{ name: string }>();
  const undo = entry ? await toTrash(supabase, userId, "food_entry", entry.name, { entry }) : null;
  await supabase.from("food_entries").delete().eq("id", id);
  const label = entry?.name ?? "Food";
  if (isIsoDate(day)) {
    await syncDay(day);
    refresh(day);
    redirect(withUndo(`/nutrition/log?d=${day}`, undo, label));
  }
  redirect(withUndo("/nutrition/log", undo, label));
}

/** Add (or take away, with a negative amount) water for a day. Never below zero. */
export async function addWater(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const day = String(formData.get("day") ?? "");
  const delta = Math.round(Number(formData.get("ml")));
  if (!isIsoDate(day) || !Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 5000) redirect("/nutrition/log");
  const { data } = await supabase.from("hydration_days").select("ml").eq("day", day).maybeSingle<{ ml: number }>();
  const next = Math.min(20000, Math.max(0, (data?.ml ?? 0) + delta));
  const { error } = await supabase.from("hydration_days").upsert({ user_id: userId, day, ml: next, updated_at: new Date().toISOString() }, { onConflict: "user_id,day" });
  if (error) redirect(`/nutrition/log?d=${day}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  redirect(`/nutrition/log?d=${day}`);
}

type Db = Awaited<ReturnType<typeof requireUser>>["supabase"];

async function insertItems(supabase: Db, userId: string, day: string, meal: string, items: MealItem[]): Promise<string | null> {
  const rows = items.map((i) => ({
    user_id: userId,
    day,
    meal,
    name: i.name.slice(0, 160),
    brand: i.brand?.slice(0, 120) || null,
    amount_label: i.amount_label?.slice(0, 60) || null,
    calories: i.calories,
    protein_g: i.protein_g,
    carbs_g: i.carbs_g,
    fat_g: i.fat_g,
    sodium_mg: i.sodium_mg,
    sugar_g: i.sugar_g,
    fiber_g: i.fiber_g,
  }));
  const { error } = await supabase.from("food_entries").insert(rows);
  if (error) return error.message;
  await syncFoodDay(supabase, userId, day);
  return null;
}

const FOOD_COLS = "name,brand,amount_label,calories,protein_g,carbs_g,fat_g,sodium_mg,sugar_g,fiber_g";

/** Multi-add: several foods to one meal in one go. */
export async function addFoodEntries(day: string, meal: string, raw: unknown): Promise<{ error: string | null; added: number }> {
  const { supabase, userId } = await requireUser();
  if (!isIsoDate(day)) return { error: "Pick a date.", added: 0 };
  if (!MEALS.includes(meal)) return { error: "Pick a meal.", added: 0 };
  const items = cleanItems(raw);
  if (!items) return { error: "Check the foods and numbers.", added: 0 };
  const error = await insertItems(supabase, userId, day, meal, items);
  if (error) return { error, added: 0 };
  refresh(day);
  return { error: null, added: items.length };
}

/** Copies one meal from another day (default yesterday) into this day's meal. */
export async function copyMeal(fromDay: string, fromMeal: string, toDay: string, toMeal: string): Promise<{ error: string | null; added: number }> {
  const { supabase, userId } = await requireUser();
  if (!isIsoDate(fromDay) || !isIsoDate(toDay)) return { error: "Pick a date.", added: 0 };
  if (!MEALS.includes(fromMeal) || !MEALS.includes(toMeal)) return { error: "Pick a meal.", added: 0 };
  const { data } = await supabase.from("food_entries").select(FOOD_COLS).eq("day", fromDay).eq("meal", fromMeal).order("created_at");
  const items = (data ?? []).map((r) => rowToItem(r as never));
  if (!items.length) return { error: "Nothing logged in that meal on that day.", added: 0 };
  const error = await insertItems(supabase, userId, toDay, toMeal, items);
  if (error) return { error, added: 0 };
  refresh(toDay);
  return { error: null, added: items.length };
}

/** Copies every meal of one day (not day totals) onto another day, keeping the meal each food was in. */
export async function copyDay(fromDay: string, toDay: string): Promise<{ error: string | null; added: number }> {
  const { supabase, userId } = await requireUser();
  if (!isIsoDate(fromDay) || !isIsoDate(toDay)) return { error: "Pick a date.", added: 0 };
  if (fromDay === toDay) return { error: "Pick a different day to copy from.", added: 0 };
  const { data } = await supabase.from("food_entries").select(`meal,${FOOD_COLS}`).eq("day", fromDay).in("meal", MEALS).order("created_at");
  const rows = data ?? [];
  if (!rows.length) return { error: "Nothing logged on that day.", added: 0 };
  for (const m of MEALS) {
    const items = rows.filter((r) => (r as { meal: string }).meal === m).map((r) => rowToItem(r as never));
    if (!items.length) continue;
    const error = await insertItems(supabase, userId, toDay, m, items);
    if (error) return { error, added: 0 };
  }
  refresh(toDay);
  return { error: null, added: rows.length };
}

async function saveFood(supabase: Db, userId: string, kind: SavedKind, name: string, portions: number, items: MealItem[]): Promise<string | null> {
  const { error } = await supabase.from("saved_foods").insert({ user_id: userId, kind, name: name.trim().slice(0, 120), portions, items });
  if (!error) return null;
  return error.code === "23505" ? "You already have one with that name." : error.message;
}

/** Saves a recipe (ingredients split into portions), a meal or a favourite food. */
export async function saveFoodSet(input: { kind: SavedKind; name: string; portions?: number; items: unknown }): Promise<{ error: string | null }> {
  const { supabase, userId } = await requireUser();
  const name = (input.name ?? "").trim();
  if (!name) return { error: "Give it a name." };
  if (!["favorite", "meal", "recipe"].includes(input.kind)) return { error: "Unknown type." };
  const items = cleanItems(input.items);
  if (!items) return { error: "Check the foods and numbers." };
  const portions = input.kind === "recipe" ? Number(input.portions) : 1;
  if (!Number.isFinite(portions) || portions <= 0 || portions > 100) return { error: "How many portions does it make?" };
  if (input.kind === "favorite" && items.length !== 1) return { error: "A favourite is one food." };
  const error = await saveFood(supabase, userId, input.kind, name, portions, items);
  if (error) return { error };
  revalidatePath("/", "layout");
  return { error: null };
}

/** Saves what you ate in a meal on a day as a reusable meal. */
export async function saveMealFromDay(day: string, meal: string, name: string): Promise<{ error: string | null }> {
  const { supabase, userId } = await requireUser();
  if (!isIsoDate(day) || !MEALS.includes(meal)) return { error: "Pick a meal." };
  if (!name.trim()) return { error: "Give the meal a name." };
  const { data } = await supabase.from("food_entries").select(FOOD_COLS).eq("day", day).eq("meal", meal).order("created_at");
  const items = (data ?? []).map((r) => rowToItem(r as never));
  if (!items.length) return { error: "That meal is empty." };
  const error = await saveFood(supabase, userId, "meal", name, 1, items);
  if (error) return { error };
  revalidatePath("/", "layout");
  return { error: null };
}

/** Stars a logged food so it shows under Favourites. */
export async function favoriteEntry(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const day = String(formData.get("day") ?? "");
  const back = isIsoDate(day) ? `/nutrition/log?d=${day}` : "/nutrition/log";
  const { data } = await supabase.from("food_entries").select(FOOD_COLS).eq("id", String(formData.get("id") ?? "")).maybeSingle();
  if (!data) redirect(flash(back, "Couldn't find that food."));
  const item = rowToItem(data as never);
  const error = await saveFood(supabase, userId, "favorite", item.name, 1, [item]);
  revalidatePath("/", "layout");
  redirect(flash(back, error ? error : `Saved ${item.name} to Favourites.`));
}

export async function deleteSavedFood(id: string): Promise<{ error: string | null }> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("saved_foods").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: null };
}

/** Logs a saved favourite, meal or recipe into a meal. For a recipe, `portions` is how much you ate. */
export async function logSavedFood(id: string, day: string, meal: string, portions = 1): Promise<{ error: string | null; added: number }> {
  const { supabase, userId } = await requireUser();
  if (!isIsoDate(day)) return { error: "Pick a date.", added: 0 };
  if (!MEALS.includes(meal)) return { error: "Pick a meal.", added: 0 };
  const { data } = await supabase.from("saved_foods").select("kind,name,portions,items").eq("id", id).maybeSingle<{ kind: SavedKind; name: string; portions: number; items: unknown }>();
  const items = data ? cleanItems(data.items) : null;
  if (!data || !items) return { error: "That saved food is gone.", added: 0 };
  if (!Number.isFinite(portions) || portions <= 0 || portions > 50) return { error: "Enter how many portions.", added: 0 };
  const entries = entriesFor({ kind: data.kind, name: data.name, portions: Number(data.portions), items }, portions);
  const error = await insertItems(supabase, userId, day, meal, entries);
  if (error) return { error, added: 0 };
  refresh(day);
  return { error: null, added: entries.length };
}

/** Marks a day as fully logged. It extends the logging streak. Needs at least one food that day. */
export async function finishDay(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const day = String(formData.get("day") ?? "");
  if (!isIsoDate(day)) redirect("/nutrition/log");
  const back = `/nutrition/log?d=${day}`;
  const { count } = await supabase.from("food_entries").select("id", { count: "exact", head: true }).eq("day", day);
  if (!count) redirect(flash(back, "Log at least one food before finishing the day."));
  const { error } = await supabase.from("day_finishes").upsert({ user_id: userId, day }, { onConflict: "user_id,day" });
  if (error) redirect(flash(back, `Couldn't finish the day: ${error.message}`));
  revalidatePath("/", "layout");
  redirect(flash(back, "Day finished. Nice work."));
}

export async function reopenDay(formData: FormData) {
  const { supabase } = await requireUser();
  const day = String(formData.get("day") ?? "");
  if (!isIsoDate(day)) redirect("/nutrition/log");
  await supabase.from("day_finishes").delete().eq("day", day);
  revalidatePath("/", "layout");
  redirect(flash(`/nutrition/log?d=${day}`, "Day reopened."));
}

/** One-tap "log yesterday's meal again": copies the same meal from the day before into this day. */
export async function logYesterdayMeal(formData: FormData) {
  const day = String(formData.get("day") ?? "");
  const meal = String(formData.get("meal") ?? "");
  if (!isIsoDate(day) || !MEALS.includes(meal)) redirect("/nutrition");
  const back = `/nutrition${day === (await getToday()) ? "" : `?d=${day}`}`;
  const res = await copyMeal(addDays(day, -1), meal, day, meal);
  redirect(flash(back, res.error ?? `Logged yesterday's ${meal} again.`));
}

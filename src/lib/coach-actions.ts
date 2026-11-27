import { parseCheckin } from "./checkin";
import { findCommon } from "./common-foods";
import { addDays, diffDays, formatDay, isIsoDate, weekdayIndex } from "./dates";
import { sessionPaceProblem } from "./distance";
import { classify } from "./intensity";
import { nextEasyDay } from "./stacking";
import type { Workout } from "./types";

/**
 * Turns "move my run to Friday" or "log 500 calories for lunch" into a proposal: exactly what would change, with the
 * numbers in it. Nothing here writes anything. A proposal only changes data after the user confirms its card.
 */

export type ActionKind =
  | "reschedule"
  | "skip"
  | "complete"
  | "swap_exercise"
  | "set_weight"
  | "swap_hard"
  | "log_food"
  | "log_water"
  | "set_targets"
  | "copy_meals"
  | "checkin"
  | "log_scan"
  | "shift_plan"
  | "downgrade";

export type Proposal = { kind: ActionKind; params: Record<string, unknown>; title: string; lines: string[] };
export type ParseResult = { proposals: Proposal[] } | { ask: string } | null;

export type CtxWorkout = Pick<Workout, "id" | "title" | "sport" | "status" | "workout_date" | "structure" | "planned_duration_min" | "planned_distance_km" | "race_id" | "generated">;
export type ParseCtx = { today: string; workouts: CtxWorkout[]; races: { id: string; name: string; race_date: string }[] };

export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
const num = (s: string | undefined) => (s === undefined ? null : Number(s.replace(",", ".")));

/** A day named in the text: today, tomorrow, a weekday (the next one), "in 3 days", 2026-11-28 or "Nov 28". Null if none. */
export function parseDay(text: string, today: string): string | null {
  const t = norm(text);
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso && isIsoDate(iso[1])) return iso[1];
  if (/\btoday\b/.test(t)) return today;
  if (/\btomorrow\b/.test(t)) return addDays(today, 1);
  if (/\byesterday\b/.test(t)) return addDays(today, -1);
  const inN = t.match(/\bin (\d{1,2}) days?\b/);
  if (inN) return addDays(today, Number(inN[1]));
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b|\\b${WEEKDAYS[i].slice(0, 3)}\\b(?!\\w)`).test(t)) {
      const diff = (i - weekdayIndex(today) + 7) % 7;
      return addDays(today, diff === 0 ? 7 : diff);
    }
  }
  const md = t.match(new RegExp(`\\b(${MONTHS.join("|")})[a-z]*\\.? (\\d{1,2})\\b`)) ?? null;
  const dm = t.match(new RegExp(`\\b(\\d{1,2}) (${MONTHS.join("|")})[a-z]*\\b`));
  const month = md ? MONTHS.indexOf(md[1]) : dm ? MONTHS.indexOf(dm[2]) : -1;
  const dayN = md ? Number(md[2]) : dm ? Number(dm[1]) : 0;
  if (month >= 0 && dayN >= 1 && dayN <= 31) {
    const y = Number(today.slice(0, 4));
    for (const yr of [y, y + 1]) {
      const iso2 = `${yr}-${String(month + 1).padStart(2, "0")}-${String(dayN).padStart(2, "0")}`;
      if (isIsoDate(iso2) && iso2 >= today) return iso2;
    }
  }
  return null;
}

const mealIn = (t: string): (typeof MEALS)[number] | null => MEALS.find((m) => new RegExp(`\\b${m}\\b`).test(t)) ?? null;

/** Which planned or recent workout the user means. Returns it, an "ask" when it is unclear, or null when none. */
function resolveWorkout(t: string, ctx: ParseCtx, opts: { statuses: string[] }): { w: CtxWorkout } | { ask: string } | null {
  const pool = ctx.workouts.filter((w) => opts.statuses.includes(w.status));
  const day = /\btoday'?s?\b/.test(t) ? ctx.today : /\btomorrow'?s?\b/.test(t) ? addDays(ctx.today, 1) : /\byesterday'?s?\b/.test(t) ? addDays(ctx.today, -1) : null;
  let cand = day ? pool.filter((w) => w.workout_date === day) : pool.filter((w) => w.workout_date >= ctx.today);
  const sportWord = /\b(run|bike|ride|swim|lift|strength|hyrox|mobility|workout|session)\b/.exec(t)?.[1];
  const sportMap: Record<string, string> = { run: "run", bike: "bike", ride: "bike", swim: "swim", lift: "strength", strength: "strength", hyrox: "hyrox", mobility: "mobility" };
  if (sportWord && sportMap[sportWord]) cand = cand.filter((w) => w.sport === sportMap[sportWord]);
  const words = t.split(/[^a-z0-9]+/).filter((x) => x.length >= 4 && !/^(move|skip|mark|done|complete|completed|today|tomorrow|workout|session|friday|saturday|sunday|monday|tuesday|wednesday|thursday|please|that|this|with|from|next|week)$/.test(x));
  const byTitle = cand.filter((w) => words.some((x) => w.title.toLowerCase().includes(x)));
  if (byTitle.length) cand = byTitle;
  cand = [...cand].sort((a, b) => (a.workout_date < b.workout_date ? -1 : 1));
  if (!cand.length) return null;
  const first = cand.filter((w) => w.workout_date === cand[0].workout_date);
  if (first.length > 1) return { ask: `Which one: ${first.map((w) => `"${w.title}"`).join(" or ")}? Say its name, like "move ${first[0].title.toLowerCase()} to Friday".` };
  return { w: first[0] };
}

const dayLabel = (d: string) => formatDay(d, { weekday: true });
const wlabel = (w: CtxWorkout) => `${w.title} (${dayLabel(w.workout_date)})`;

/** Words for how someone feels, mapped to the check-in's scales. */
export function mapCheckin(text: string): { sleep_hours: number | null; soreness: number | null; energy: number | null; notes: string[] } {
  const t = norm(text);
  const notes: string[] = [];
  let sleep: number | null = null;
  const hours = t.match(/\b(?:slept|sleep)\b[^0-9]{0,12}(\d{1,2}(?:\.\d)?)\s*(?:h|hrs?|hours?)\b/) ?? t.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:h|hrs?|hours?) (?:of )?sleep\b/);
  if (hours) sleep = Number(hours[1]);
  else if (/\bslept (?:really |very |so )?(?:badly|poorly|terribly|awful|like (?:crap|garbage))|\bbad sleep|\bpoor sleep|\bbarely slept|\bno sleep/.test(t)) {
    sleep = 5;
    notes.push("sleep: 'badly' counted as about 5 h");
  }
  else if (/\bslept (?:ok|okay|fine|alright)|\bso-so sleep/.test(t)) {
    sleep = 7;
    notes.push("sleep: 'ok' counted as about 7 h");
  }
  else if (/\bslept (?:really |very |so )?(?:well|great|amazing|like a baby)|\bgreat sleep|\bgood sleep/.test(t)) {
    sleep = 8;
    notes.push("sleep: 'well' counted as about 8 h");
  }
  let soreness: number | null = null;
  if (/\b(not sore|no soreness|not at all sore|feel(?:ing)? fresh)\b/.test(t)) soreness = 1;
  else if (/\b(?:wrecked|destroyed|barely walk|very sore|really sore|super sore|extremely sore|so sore)\b/.test(t)) soreness = 4;
  else if (/\b(?:pretty|fairly|quite|moderately|kind of|kinda) sore\b/.test(t)) soreness = 3;
  else if (/\b(?:a bit|slightly|a little|bit) sore\b|\bmild(?:ly)? sore/.test(t)) soreness = 2;
  else if (/\bsore\b/.test(t)) soreness = 3;
  let energy: number | null = null;
  if (/\b(drained|exhausted|wiped|dead tired|no energy|knackered)\b/.test(t)) energy = 1;
  else if (/\b(tired|low energy|sluggish|run down|fatigued)\b/.test(t)) energy = 2;
  else if (/\b(energy (?:is )?(?:ok|okay|fine)|feel(?:ing)? (?:ok|okay|fine|alright))\b/.test(t)) energy = 3;
  else if (/\b(good energy|feel(?:ing)? good|energized|energised|feel(?:ing)? strong)\b/.test(t)) energy = 4;
  else if (/\b(great energy|feel(?:ing)? great|amazing|full of energy)\b/.test(t)) energy = 5;
  return { sleep_hours: sleep, soreness, energy, notes };
}

const SCALE_SORE = ["", "None", "Mild", "Moderate", "High", "Very high"];
const SCALE_ENERGY = ["", "Drained", "Low", "OK", "Good", "Great"];

export function parseAction(raw: string, ctx: ParseCtx): ParseResult {
  const t = norm(raw).replace(/[?!.]+$/g, "");
  if (!t || /^(what|why|how|when|where|who|which|am i|are you|is |do i|did i|can you tell|tell me|show|break down)\b/.test(t)) return null;

  // ---- race plan shift -----------------------------------------------------
  const shift = t.match(/\b(?:shift|push|move|delay|postpone|bring forward|pull)\b.*\b(?:plan|training plan|race plan)\b(.*)/);
  if (shift) {
    const rest = shift[1] ?? "";
    const n = rest.match(/\b(\d{1,2}) (day|week)s?\b/);
    const oneWeek = /\b(a|one|1) week\b/.test(rest);
    let days = n ? Number(n[1]) * (n[2] === "week" ? 7 : 1) : oneWeek ? 7 : /\bby a day|\bone day\b/.test(rest) ? 1 : 0;
    if (!days) return { ask: 'By how many days? For example: "shift my plan back 3 days" or "push my plan later a week".' };
    if (/\b(earlier|forward|sooner|up)\b/.test(t) && !/\b(back|later|delay|postpone)\b/.test(t)) days = -days;
    const race = ctx.races.find((r) => r.race_date >= ctx.today);
    if (!race) return { ask: "You don't have an upcoming race with a plan to shift." };
    const affected = ctx.workouts.filter((w) => w.race_id === race.id && w.generated && w.status === "planned" && w.workout_date >= ctx.today);
    if (!affected.length) return { ask: `${race.name} has no upcoming generated sessions to shift.` };
    const last = affected.reduce((m, w) => (w.workout_date > m ? w.workout_date : m), affected[0].workout_date);
    const first = affected.reduce((m, w) => (w.workout_date < m ? w.workout_date : m), affected[0].workout_date);
    if (addDays(first, days) < ctx.today) return { ask: "That would move sessions into the past. Shift later, or by fewer days." };
    if (addDays(last, days) >= race.race_date) return { ask: `That would push sessions onto or past race day (${dayLabel(race.race_date)}). Try fewer days, or rebuild the plan from Races.` };
    return { proposals: [{ kind: "shift_plan", params: { raceId: race.id, days }, title: `Shift ${race.name} plan ${days > 0 ? "later" : "earlier"} by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`, lines: [`${affected.length} unfinished planned sessions move ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ${days > 0 ? "later" : "earlier"}.`, `They would run ${dayLabel(addDays(first, days))} to ${dayLabel(addDays(last, days))}; race day stays ${dayLabel(race.race_date)}.`, "Completed and skipped sessions, and your own sessions, don't move."] }] };
  }

  // ---- swap a hard session for an easier day -------------------------------
  if (/\b(swap|switch|trade|ease|downgrade|make)\b.*\b(hard|today'?s (?:session|workout)|easier|easy)\b/.test(t) && /\b(swap|switch|trade|ease|downgrade|easier|easy)\b/.test(t) && !/\bfor\b.*\b(squat|bench|press|row|deadlift|curl)\b/.test(t)) {
    const todays = ctx.workouts.filter((w) => w.workout_date === ctx.today && w.status === "planned" && classify(w).level === "hard");
    if (!todays.length) return { ask: "There's no hard session planned for today to swap. Tell me which workout to move, like 'move my run to Friday'." };
    const target = todays[0];
    const window = ctx.workouts.filter((w) => w.workout_date >= ctx.today && w.workout_date <= addDays(ctx.today, 4));
    const to = nextEasyDay(window as unknown as Parameters<typeof nextEasyDay>[0], ctx.today, 3);
    if (!to) return { ask: "There's no easy day in the next 3 days to swap into. Tell me a day to move it to instead." };
    const easy = window.filter((w) => w.workout_date === to && w.status === "planned" && classify(w).level === "easy");
    const moves = [{ id: target.id, from: target.workout_date, to }, ...easy.map((e) => ({ id: e.id, from: e.workout_date, to: ctx.today }))];
    return { proposals: [{ kind: "swap_hard", params: { moves }, title: `Move ${target.title} to ${dayLabel(to)}`, lines: [`${target.title}: ${dayLabel(ctx.today)} to ${dayLabel(to)}.`, ...easy.map((e) => `${e.title}: ${dayLabel(to)} to ${dayLabel(ctx.today)} (a swap, so the load doesn't pile up).`)] }] };
  }

  // ---- skip / complete -------------------------------------------------------
  if (/^(skip|cancel|drop|scrap)\b|\bmark\b.*\bskipped\b|\bi(?:'ll| will)? skip\b/.test(t)) {
    const r = resolveWorkout(t, ctx, { statuses: ["planned", "in_progress"] });
    if (!r) return { ask: "I couldn't find a planned workout to skip. Say which one, like 'skip today's run'." };
    if ("ask" in r) return { ask: r.ask };
    return { proposals: [{ kind: "skip", params: { id: r.w.id, title: r.w.title, status: r.w.status }, title: `Skip ${wlabel(r.w)}`, lines: ["It stays in your history as skipped. Undo puts it back to planned."] }] };
  }
  if (/\b(?:mark|set)\b.*\b(done|complete|completed|finished)\b|\bi (?:did|finished|completed)\b.*\b(workout|session|run|ride|swim|lift)\b|\bdone with\b/.test(t)) {
    const r = resolveWorkout(t, ctx, { statuses: ["planned", "in_progress"] });
    if (!r) return { ask: "I couldn't find a planned workout to mark done. Say which one, like 'mark today's run done'." };
    if ("ask" in r) return { ask: r.ask };
    const issue = sessionPaceProblem(r.w.sport, r.w.planned_duration_min, r.w.planned_distance_km !== null ? Number(r.w.planned_distance_km) : null, r.w.title);
    if (issue) return { ask: `I can't mark ${r.w.title} done as planned: ${issue} Edit the workout first.` };
    return { proposals: [{ kind: "complete", params: { id: r.w.id, title: r.w.title }, title: `Mark ${wlabel(r.w)} done`, lines: ["Counts as done exactly as planned: the planned sets are recorded, with your usual weights.", "If you did it differently, log it from the workout instead."] }] };
  }

  // ---- reschedule -------------------------------------------------------------
  if (/^(move|reschedule|push|put|shift|bump|change)\b/.test(t) && /\b(workout|session|run|ride|bike|swim|lift|strength|hyrox|mobility|today'?s|tomorrow'?s|yesterday'?s)\b/.test(t) && /\b(to|until|on)\b/.test(t)) {
    const split = t.split(/\b(?:to|until|onto|on)\b(?!.*\b(?:to|until|onto|on)\b)/);
    const to = parseDay(split[1] ?? "", ctx.today);
    if (!to) return { ask: 'Which day? For example: "move today\'s run to Friday".' };
    if (to < ctx.today) return { ask: "I won't move a session into the past. Pick today or a later day." };
    const r = resolveWorkout(split[0], ctx, { statuses: ["planned", "in_progress"] });
    if (!r) return { ask: "I couldn't find a planned workout like that. Say which one, like 'move today's run to Friday'." };
    if ("ask" in r) return { ask: r.ask };
    if (r.w.workout_date === to) return { ask: `${r.w.title} is already on ${dayLabel(to)}.` };
    const there = ctx.workouts.filter((w) => w.workout_date === to && w.status !== "skipped" && w.id !== r.w.id);
    return { proposals: [{ kind: "reschedule", params: { id: r.w.id, title: r.w.title, from: r.w.workout_date, to }, title: `Move ${r.w.title} to ${dayLabel(to)}`, lines: [`${dayLabel(r.w.workout_date)} to ${dayLabel(to)}.`, ...(there.length ? [`Heads up: ${dayLabel(to)} already has ${there.map((w) => w.title).join(", ")}.`] : [])] }] };
  }

  // ---- swap one exercise for another / set a weight ----------------------------
  const swapEx = t.match(/\b(?:swap|replace|switch|change)\b\s+(?:the\s+)?(.+?)\s+(?:for|with|to|by)\s+(.+?)(?:\s+(?:in|on|for)\s+(?:today'?s|my|the|tomorrow'?s).*)?$/);
  if (swapEx && !/\b(session|workout|run|ride)\b/.test(swapEx[1])) {
    const from = swapEx[1].replace(/\bmy\b/g, "").trim();
    const to = swapEx[2].replace(/\b(today|tomorrow)\b.*$/, "").trim();
    const hit = ctx.workouts.filter((w) => ["planned"].includes(w.status) && w.workout_date >= ctx.today).sort((a, b) => (a.workout_date < b.workout_date ? -1 : 1)).find((w) => (w.structure?.exercises ?? []).some((e) => e.name.toLowerCase().includes(from)));
    if (!hit) return { ask: `I couldn't find "${from}" in an upcoming planned workout.` };
    const ex = (hit.structure?.exercises ?? []).find((e) => e.name.toLowerCase().includes(from))!;
    const newName = to.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);
    if (!newName.trim()) return { ask: "Swap it for what?" };
    return { proposals: [{ kind: "swap_exercise", params: { id: hit.id, from: ex.name, to: newName, title: hit.title }, title: `Swap ${ex.name} for ${newName}`, lines: [`In ${wlabel(hit)}. Sets and reps stay the same${ex.weight_lb ? "; the planned weight is cleared so your history picks it for the new lift" : ""}.`] }] };
  }
  const setWeight = t.match(/\b(?:set|use|change|make|put|bump)\b.*?\b(\d{2,4}(?:\.\d)?)\s*(?:lb|lbs|pounds?)?\b/);
  if (setWeight && /\b(on|for|to|at)\b/.test(t) && !/\b(calorie|protein|carb|fat|target|goal|water|ml|scan)\b/.test(t)) {
    const weight = Number(setWeight[1]);
    const cands = ctx.workouts.filter((w) => w.status === "planned" && w.workout_date >= ctx.today).sort((a, b) => (a.workout_date < b.workout_date ? -1 : 1));
    for (const w of cands) {
      const ex = (w.structure?.exercises ?? []).find((e) => t.includes(e.name.toLowerCase()) || e.name.toLowerCase().split(" ").some((p) => p.length >= 4 && new RegExp(`\\b${p}s?\\b`).test(t)));
      if (ex) {
        if (!(weight > 0 && weight <= 1500)) return { ask: "That weight doesn't look right. Use a number up to 1500 lb." };
        return { proposals: [{ kind: "set_weight", params: { id: w.id, exercise: ex.name, weight, title: w.title }, title: `${ex.name}: ${weight} lb`, lines: [`In ${wlabel(w)}${ex.weight_lb ? `, changed from ${ex.weight_lb} lb` : ""}.`] }] };
      }
    }
    return { ask: "I couldn't match that to an exercise in an upcoming planned workout." };
  }

  // ---- water -----------------------------------------------------------------
  const water = t.match(/\b(\d+(?:[.,]\d+)?)\s*(ml|milliliters?|l|liters?|litres?|oz|ounces?|glass(?:es)?|cups?|bottles?)\b/);
  if (water && (/\bwater\b/.test(t) || /\b(drank|drink|had)\b/.test(t)) && !/\bcalor/.test(t)) {
    const v = num(water[1])!;
    const u = water[2];
    const ml = /^l|^lit/.test(u) ? v * 1000 : /^oz|^ounce/.test(u) ? v * 29.5735 : /^glass|^cup/.test(u) ? v * 250 : /^bottle/.test(u) ? v * 500 : v;
    const rounded = Math.round(ml);
    if (!(rounded > 0 && rounded <= 5000)) return { ask: "Water in one go can be 1 to 5000 ml. How much did you drink?" };
    const day = /\byesterday\b/.test(t) ? addDays(ctx.today, -1) : ctx.today;
    return { proposals: [{ kind: "log_water", params: { day, ml: rounded }, title: `Add ${rounded} ml of water`, lines: [`${dayLabel(day)}. ${/^glass|^cup|^bottle|^oz|^ounce/.test(u) ? `Counting a ${/^glass|^cup/.test(u) ? "glass or cup as 250 ml" : /^bottle/.test(u) ? "bottle as 500 ml" : "ounce as 29.6 ml"}.` : ""}`.trim()] }] };
  }

  // ---- copy yesterday's meals -----------------------------------------------
  if (/\b(copy|repeat|same as|duplicate)\b.*\byesterday/.test(t)) {
    const meal = mealIn(t);
    return { proposals: [{ kind: "copy_meals", params: { from: addDays(ctx.today, -1), to: ctx.today, meal }, title: meal ? `Copy yesterday's ${meal} to today` : "Copy yesterday's meals to today", lines: [meal ? `Yesterday's ${meal} foods are added to today's ${meal}.` : "Every food from yesterday is added to the same meal today.", "Nothing is replaced; foods already logged today stay."] }] };
  }

  // ---- targets ---------------------------------------------------------------
  const tgt = t.match(/\b(?:set|change|update|make|raise|lower|adjust)\b.*?\b(rest day |rest )?(calorie|calories|cals?|protein|carbs?|carbohydrates?|fat)s?\b(?: target| goal)?\s*(?:to|at|=)?\s*(\d{2,5})\b/);
  if (tgt && !/\bwater\b/.test(t)) {
    const rest = !!tgt[1];
    const field = /^cal/.test(tgt[2]) ? "calorie" : /^protein/.test(tgt[2]) ? "protein" : /^carb/.test(tgt[2]) ? "carbs" : "fat";
    const value = Number(tgt[3]);
    if (!(value > 0 && value < 20000)) return { ask: "Targets are between 1 and 19,999." };
    const col = { calorie: rest ? "rest_calorie_target" : "calorie_target", protein: rest ? "rest_protein_g" : "protein_target_g", carbs: rest ? "rest_carbs_g" : "carbs_target_g", fat: rest ? "rest_fat_g" : "fat_target_g" }[field];
    return { proposals: [{ kind: "set_targets", params: { column: col, value }, title: `Set ${rest ? "rest-day " : ""}${field === "calorie" ? "calorie" : field} target to ${value}${field === "calorie" ? " cal" : " g"}`, lines: ["Changes your saved nutrition target. Undo restores the old one."] }] };
  }

  // ---- scan --------------------------------------------------------------------
  if (/\b(log|add|record|save|enter)\b.*\b(scan|weigh[- ]?in|my weight|weight)\b|\bi weigh\b|\bscan\b.*\b\d{2,3}/.test(t)) {
    const wt = t.match(/\b(\d{2,3}(?:\.\d)?)\s*(?:lb|lbs|pounds?)\b/) ?? t.match(/\b(?:weight|weigh|scan)[^0-9]{0,12}(\d{2,3}(?:\.\d)?)\b/);
    const bf = t.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:%|percent)\s*(?:body ?fat|bf|fat)?/) ?? t.match(/\bbody ?fat[^0-9]{0,8}(\d{1,2}(?:\.\d)?)/);
    const muscle = t.match(/\b(?:muscle|smm|skeletal muscle)[^0-9]{0,10}(\d{2,3}(?:\.\d)?)/);
    const weight = wt ? Number(wt[1]) : null;
    const bodyFat = bf ? Number(bf[1]) : null;
    const smm = muscle ? Number(muscle[1]) : null;
    if (weight === null && bodyFat === null && smm === null) return { ask: 'What are the numbers? For example: "log scan 180 lb 18% body fat".' };
    if (weight !== null && !(weight >= 40 && weight <= 800)) return { ask: "That weight looks off (40 to 800 lb)." };
    if (bodyFat !== null && !(bodyFat >= 2 && bodyFat <= 70)) return { ask: "That body fat % looks off (2 to 70)." };
    return { proposals: [{ kind: "log_scan", params: { weight_lb: weight, body_fat_pct: bodyFat, skeletal_muscle_lb: smm }, title: `Log scan${weight ? ` ${weight} lb` : ""}${bodyFat ? ` ${bodyFat}% fat` : ""}`, lines: ["Saved with today's date as a manual scan."] }] };
  }

  // ---- recovery check-in ---------------------------------------------------------
  if (/\b(slept|my sleep|i(?:'m| am|'ve been) (?:so |really |very |pretty |kind of )?(?:sore|tired|drained|exhausted|wiped)|feeling (?:sore|tired|drained|exhausted|great|good|fresh)|i feel (?:sore|tired|drained|great|good|fresh|wrecked)|check[- ]?in|sore legs|so sore)\b/.test(t)) {
    const m = mapCheckin(t);
    const parsed = parseCheckin({ sleep: m.sleep_hours === null ? null : String(m.sleep_hours), soreness: m.soreness === null ? null : String(m.soreness), energy: m.energy === null ? null : String(m.energy) });
    if ("error" in parsed) return { ask: 'I couldn\'t map that to sleep, soreness or energy. Try "slept 6 hours, sore, low energy".' };
    const v = parsed.value;
    return { proposals: [{ kind: "checkin", params: v, title: "Log today's check-in", lines: [v.sleep_hours !== null ? `Sleep: ${v.sleep_hours} h` : "Sleep: not answered", v.soreness !== null ? `Soreness: ${v.soreness} of 5 (${SCALE_SORE[v.soreness]})` : "Soreness: not answered", v.energy !== null ? `Energy: ${v.energy} of 5 (${SCALE_ENERGY[v.energy]})` : "Energy: not answered", ...m.notes.map((n) => `Estimate: ${n}`)] }] };
  }

  // ---- log food ----------------------------------------------------------------
  if (/^(log|add|i (?:ate|had)|ate|had)\b/.test(t)) {
    const body = t.replace(/^(log|add|i ate|i had|ate|had)\s+/, "");
    const day = /\byesterday\b/.test(t) ? addDays(ctx.today, -1) : ctx.today;
    const meal = mealIn(t) ?? (/\bbreakfast|morning/.test(t) ? "breakfast" : null);
    const cal = body.match(/\b(\d{2,4})\s*(?:cal|cals|calories|kcal)\b/);
    if (cal) {
      const p = body.match(/\b(\d{1,3}(?:\.\d)?)\s*g\s*(?:of\s*)?protein\b/);
      const c = body.match(/\b(\d{1,3}(?:\.\d)?)\s*g\s*(?:of\s*)?carbs?\b/);
      const f = body.match(/\b(\d{1,3}(?:\.\d)?)\s*g\s*(?:of\s*)?fat\b/);
      const calories = Number(cal[1]);
      if (!(calories > 0 && calories <= 5000)) return { ask: "Calories for one entry should be between 1 and 5000." };
      const item = { name: "Quick entry", brand: null, amount_label: null, calories, protein_g: p ? Number(p[1]) : 0, carbs_g: c ? Number(c[1]) : 0, fat_g: f ? Number(f[1]) : 0, sodium_mg: null, sugar_g: null, fiber_g: null };
      const m = meal ?? "snack";
      return { proposals: [{ kind: "log_food", params: { day, meal: m, items: [item] }, title: `Log ${calories} cal to ${m}`, lines: [`${dayLabel(day)}, ${m}: ${calories} cal, ${item.protein_g} g protein, ${item.carbs_g} g carbs, ${item.fat_g} g fat.`, ...(meal ? [] : ["No meal named, so it goes in Snack."])] }] };
    }
    const names = body.replace(/\b(for|at|in|to)\s+(breakfast|lunch|dinner|snack)\b/g, "").replace(/\byesterday\b/g, "").replace(/\bto my food log\b/g, "").trim();
    const parts = names.split(/\s*(?:,|\band\b|\+)\s*/).map((s) => s.trim()).filter(Boolean);
    const items = [];
    const missing: string[] = [];
    for (const part of parts) {
      const q = part.match(/^(\d+(?:\.\d+)?)\s*x?\s+(.+)$/);
      const count = q ? Number(q[1]) : 1;
      const hit = findCommon((q ? q[2] : part).replace(/^(a|an|some|the)\s+/, "").replace(/s$/, ""), 1)[0];
      if (!hit || !(count > 0 && count <= 20)) {
        missing.push(part);
        continue;
      }
      items.push({ name: hit.name, brand: null, amount_label: `${count} × ${hit.serving}`, calories: Math.round(hit.calories * count), protein_g: Math.round(hit.protein_g * count * 10) / 10, carbs_g: Math.round(hit.carbs_g * count * 10) / 10, fat_g: Math.round(hit.fat_g * count * 10) / 10, sodium_mg: null, sugar_g: null, fiber_g: null });
    }
    if (!items.length) return { ask: `I don't have "${missing[0] ?? body}" in my short list of common foods. Give me the numbers instead: "log 350 calories 30g protein for lunch".` };
    const m = meal ?? "snack";
    return { proposals: [{ kind: "log_food", params: { day, meal: m, items }, title: `Log ${items.map((i) => i.name.toLowerCase()).join(", ")} to ${m}`, lines: [...items.map((i) => `${i.name} (${i.amount_label}): ${i.calories} cal, ${i.protein_g} g protein. Typical values.`), ...(missing.length ? [`Not added, not in my list: ${missing.join(", ")}.`] : []), ...(meal ? [] : ["No meal named, so it goes in Snack."])] }] };
  }

  return null;
}

/** Days helper used by the executor's checks. */
export const daysBetween = diffDays;

/**
 * The easier version of a hard planned session: about 60% of the time and distance (so pace stays the same), one fewer
 * set per lift, and an "Easy:" title. Returns null when the session isn't a plain planned one.
 */
export function downgradeProposal(w: CtxWorkout): Proposal | null {
  if (w.status !== "planned") return null;
  const orig = w.planned_duration_min;
  const minutes = orig ? Math.min(orig, Math.max(15, Math.round(orig * 0.6))) : null;
  const ratio = minutes && orig ? minutes / orig : 1;
  const km = w.planned_distance_km !== null && w.planned_distance_km !== undefined ? Math.round(Number(w.planned_distance_km) * ratio * 100) / 100 : null;
  const title = (/^easy\b/i.test(w.title) ? w.title : `Easy: ${w.title}`).slice(0, 120);
  const structure = w.structure?.exercises?.length ? { ...w.structure, exercises: w.structure.exercises.map((e) => (e.sets && e.sets > 1 ? { ...e, sets: e.sets - 1 } : e)) } : w.structure ?? null;
  const lines = [`Renamed "${title}".`, ...(minutes && orig && minutes !== orig ? [`${orig} min becomes ${minutes} min${km !== null && w.planned_distance_km ? `, ${Number(w.planned_distance_km)} km becomes ${km} km` : ""}.`] : []), ...(structure !== w.structure ? ["One fewer set on each lift."] : []), "Undo puts it back exactly."];
  return { kind: "downgrade", params: { id: w.id, title, minutes, km, structure, original: w.title }, title: `Make ${w.title} easier today`, lines };
}

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/food-sync", () => ({ syncFoodDay: vi.fn(async () => {}) }));
vi.mock("@/lib/record-planned", () => ({ recordPlannedSets: vi.fn(async () => " Recorded 3 planned sets.") }));

import { apply, revert } from "./exec";

type Row = Record<string, unknown>;
/** A tiny in-memory stand-in for the Supabase client: just enough chaining for the executor. */
function fakeDb(seed: Record<string, Row[]>) {
  const t: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  let n = 100;
  const from = (name: string) => {
    t[name] ??= [];
    let rows = t[name];
    let op: "select" | "update" | "delete" = "select";
    let patch: Row = {};
    let wantIds = false;
    const run = () => {
      if (op === "update") rows.forEach((r) => Object.assign(r, patch));
      if (op === "delete") t[name] = t[name].filter((r) => !rows.includes(r));
      return { data: wantIds ? rows.map((r) => ({ id: r.id })) : rows, error: null, count: rows.length };
    };
    const q: Record<string, unknown> = {
      select: () => {
        wantIds = wantIds || false;
        return q;
      },
      eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
      neq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] !== v)), q),
      in: (c: string, v: unknown[]) => ((rows = rows.filter((r) => v.includes(r[c]))), q),
      gte: (c: string, v: string) => ((rows = rows.filter((r) => String(r[c]) >= v)), q),
      order: () => q,
      maybeSingle: async () => ({ data: rows[0] ? { ...rows[0] } : null, error: null }),
      update: (p: Row) => ((op = "update"), (patch = p), q),
      delete: () => ((op = "delete"), q),
      insert: (p: Row | Row[]) => {
        const list = (Array.isArray(p) ? p : [p]).map((r) => ({ id: `n${n++}`, ...r }));
        t[name].push(...list);
        rows = list;
        wantIds = true;
        return q;
      },
      upsert: async (p: Row) => {
        const key = "day" in p ? "day" : "id";
        const ex = t[name].find((r) => r[key] === p[key]);
        if (ex) Object.assign(ex, p);
        else t[name].push(p);
        return { error: null };
      },
      then: (res: (v: unknown) => unknown) => res(run()),
    };
    return q;
  };
  return { db: { from } as unknown as SupabaseClient, t };
}

const today = "2026-11-26";
const W = (o: Row) => ({ id: "w1", title: "Easy run", sport: "run", status: "planned", workout_date: today, structure: null, progress: null, completed_at: null, planned_duration_min: 40, planned_distance_km: 6, ...o });

describe("coach executor", () => {
  it("reschedules and undoes exactly", async () => {
    const { db, t } = fakeDb({ workouts: [W({})] });
    const out = await apply(db, "u", "reschedule", { id: "w1", to: "2026-11-27" }, today);
    expect(t.workouts[0].workout_date).toBe("2026-11-27");
    await revert(db, "u", "reschedule", out.undo);
    expect(t.workouts[0].workout_date).toBe(today);
  });

  it("refuses to move into the past or to move a finished session", async () => {
    const { db, t } = fakeDb({ workouts: [W({}), W({ id: "w2", status: "completed" })] });
    await expect(apply(db, "u", "reschedule", { id: "w1", to: "2026-11-20" }, today)).rejects.toThrow(/past/);
    await expect(apply(db, "u", "reschedule", { id: "w2", to: "2026-11-28" }, today)).rejects.toThrow(/already done/);
    expect(t.workouts[0].workout_date).toBe(today);
  });

  it("skips and restores the old status", async () => {
    const { db, t } = fakeDb({ workouts: [W({})] });
    const out = await apply(db, "u", "skip", { id: "w1" }, today);
    expect(t.workouts[0].status).toBe("skipped");
    await revert(db, "u", "skip", out.undo);
    expect(t.workouts[0].status).toBe("planned");
  });

  it("won't complete a session with an impossible pace", async () => {
    const { db, t } = fakeDb({ workouts: [W({ planned_duration_min: 10, planned_distance_km: 10 })] });
    await expect(apply(db, "u", "complete", { id: "w1" }, today)).rejects.toThrow(/pace|Edit the workout/i);
    expect(t.workouts[0].status).toBe("planned");
  });

  it("completes, and undo deletes only the sets it recorded", async () => {
    const { db, t } = fakeDb({ workouts: [W({})], workout_sets: [] });
    t.workout_sets.push({ id: "s1", workout_id: "w1" });
    const out = await apply(db, "u", "complete", { id: "w1" }, today);
    expect(t.workouts[0].status).toBe("completed");
    expect(out.message).toMatch(/Recorded 3/);
    await revert(db, "u", "complete", out.undo);
    expect(t.workouts[0].status).toBe("planned");
    expect(t.workout_sets).toHaveLength(1); // sets that existed before are kept
  });

  it("changes a weight and restores the old structure", async () => {
    const structure = { exercises: [{ name: "Back squat", sets: 3, reps: 5, weight_lb: 185 }] };
    const { db, t } = fakeDb({ workouts: [W({ sport: "strength", title: "Legs", structure })] });
    const out = await apply(db, "u", "set_weight", { id: "w1", exercise: "Back squat", weight: 195 }, today);
    expect((t.workouts[0].structure as typeof structure).exercises[0].weight_lb).toBe(195);
    await revert(db, "u", "set_weight", out.undo);
    expect((t.workouts[0].structure as typeof structure).exercises[0].weight_lb).toBe(185);
    await expect(apply(db, "u", "set_weight", { id: "w1", exercise: "Back squat", weight: 5000 }, today)).rejects.toThrow(/weight/);
  });

  it("logs food and undo removes only those entries", async () => {
    const { db, t } = fakeDb({ food_entries: [{ id: "old", day: today, meal: "lunch", name: "Rice" }] });
    const item = { name: "Quick entry", brand: null, amount_label: null, calories: 500, protein_g: 40, carbs_g: 0, fat_g: 0, sodium_mg: null, sugar_g: null, fiber_g: null };
    const out = await apply(db, "u", "log_food", { day: today, meal: "lunch", items: [item] }, today);
    expect(t.food_entries).toHaveLength(2);
    await revert(db, "u", "log_food", out.undo);
    expect(t.food_entries.map((r) => r.id)).toEqual(["old"]);
    await expect(apply(db, "u", "log_food", { day: today, meal: "lunch", items: [{ ...item, calories: -5 }] }, today)).rejects.toThrow();
  });

  it("adds water and restores the previous amount", async () => {
    const { db, t } = fakeDb({ hydration_days: [{ day: today, ml: 800 }] });
    const out = await apply(db, "u", "log_water", { day: today, ml: 500 }, today);
    expect(t.hydration_days[0].ml).toBe(1300);
    await revert(db, "u", "log_water", out.undo);
    expect(t.hydration_days[0].ml).toBe(800);
    await expect(apply(db, "u", "log_water", { day: today, ml: 9000 }, today)).rejects.toThrow();
  });

  it("sets a target within bounds and restores it", async () => {
    const { db, t } = fakeDb({ profiles: [{ id: "u", protein_target_g: 150 }] });
    const out = await apply(db, "u", "set_targets", { column: "protein_target_g", value: 180 }, today);
    expect(t.profiles[0].protein_target_g).toBe(180);
    await revert(db, "u", "set_targets", out.undo);
    expect(t.profiles[0].protein_target_g).toBe(150);
    await expect(apply(db, "u", "set_targets", { column: "protein_target_g", value: 99999 }, today)).rejects.toThrow();
    await expect(apply(db, "u", "set_targets", { column: "role", value: 5 }, today)).rejects.toThrow();
  });

  it("validates check-ins with the screen's rules", async () => {
    const { db, t } = fakeDb({ recovery_checkins: [] });
    await expect(apply(db, "u", "checkin", { sleep_hours: 30, soreness: 3, energy: null }, today)).rejects.toThrow(/Sleep/);
    const out = await apply(db, "u", "checkin", { sleep_hours: 5, soreness: 3, energy: null }, today);
    expect(t.recovery_checkins).toHaveLength(1);
    await revert(db, "u", "checkin", out.undo);
    expect(t.recovery_checkins).toHaveLength(0);
  });

  it("downgrades a hard session and undo restores every field", async () => {
    const { db, t } = fakeDb({ workouts: [W({ title: "Tempo run", planned_duration_min: 50, planned_distance_km: 10 })] });
    const out = await apply(db, "u", "downgrade", { id: "w1", title: "Easy: Tempo run", minutes: 30, km: 6, structure: null }, today);
    expect(t.workouts[0]).toMatchObject({ title: "Easy: Tempo run", planned_duration_min: 30, planned_distance_km: 6 });
    await revert(db, "u", "downgrade", out.undo);
    expect(t.workouts[0]).toMatchObject({ title: "Tempo run", planned_duration_min: 50, planned_distance_km: 10 });
  });

  it("won't downgrade a session that was done or made harder, or into a bad pace", async () => {
    const done = fakeDb({ workouts: [W({ status: "completed" })] });
    await expect(apply(done.db, "u", "downgrade", { id: "w1", title: "Easy", minutes: 30, km: 6 }, today)).rejects.toThrow(/planned/);
    const longer = fakeDb({ workouts: [W({})] });
    await expect(apply(longer.db, "u", "downgrade", { id: "w1", title: "Easy", minutes: 90, km: 6 }, today)).rejects.toThrow(/duration/);
    const pace = fakeDb({ workouts: [W({})] });
    await expect(apply(pace.db, "u", "downgrade", { id: "w1", title: "Easy", minutes: 10, km: 20 }, today)).rejects.toThrow();
  });
});

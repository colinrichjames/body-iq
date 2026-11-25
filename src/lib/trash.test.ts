import { describe, expect, it } from "vitest";
import { restoreFromTrash, withUndo } from "./trash";

type Call = { table: string; op: string; arg?: unknown };

function fakeClient(row: { id: string; kind: string; payload: Record<string, unknown> } | null, failInsert?: string) {
  const calls: Call[] = [];
  const from = (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "trash" ? row : null }) }), eq2: null }),
    insert: async (arg: unknown) => {
      calls.push({ table, op: "insert", arg });
      return { error: failInsert && table !== "trash" ? { message: failInsert } : null };
    },
    delete: () => ({
      eq: async () => {
        calls.push({ table, op: "delete" });
        return { error: null };
      },
    }),
  });
  return { client: { from } as never, calls };
}

describe("undo", () => {
  it("restores a workout and its sets, then clears the trash row", async () => {
    const { client, calls } = fakeClient({ id: "t1", kind: "workout", payload: { workout: { id: "w1", title: "Push" }, sets: [{ id: "s1" }, { id: "s2" }] } });
    const res = await restoreFromTrash(client, "u1", "t1");
    expect(res).toEqual({ to: "/workouts/w1" });
    expect(calls.filter((c) => c.op === "insert").map((c) => c.table)).toEqual(["workouts", "workout_sets"]);
    expect(calls.at(-1)).toEqual({ table: "trash", op: "delete" });
  });
  it("restores a race before its planned sessions", async () => {
    const { client, calls } = fakeClient({ id: "t2", kind: "race", payload: { race: { id: "r1" }, workouts: [{ id: "w1" }] } });
    await restoreFromTrash(client, "u1", "t2");
    expect(calls.filter((c) => c.op === "insert").map((c) => c.table)).toEqual(["races", "workouts"]);
  });
  it("reports an expired item and keeps going on duplicates", async () => {
    expect(await restoreFromTrash(fakeClient(null).client, "u1", "x")).toEqual({ error: "That item can't be restored any more." });
    const dup = fakeClient({ id: "t3", kind: "scan", payload: { scan: { id: "b1" } } }, "duplicate key value");
    expect(await restoreFromTrash(dup.client, "u1", "t3")).toEqual({ error: "That item is already back." });
  });
  it("builds undo links", () => {
    expect(withUndo("/workouts", "abc", "Push day")).toBe("/workouts?undo=abc&ul=Push%20day");
    expect(withUndo("/nutrition/log?d=2026-11-25", "abc", "Oats")).toContain("&undo=abc");
    expect(withUndo("/x", null, "n")).toBe("/x");
  });
});

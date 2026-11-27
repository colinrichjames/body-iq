import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ today: "2026-11-30", rows: [] as { day: string; kind: string; reply: unknown }[], down: null as unknown, review: null as unknown, inserts: 0 }));
vi.mock("@/lib/today", () => ({ getToday: async () => state.today }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({
    userId: "u",
    supabase: {
      from: (t: string) => {
        if (t === "coach_proactive")
          return {
            select: () => ({ eq: (_c: string, day: string) => ({ maybeSingle: async () => ({ data: state.rows.find((r) => r.day === day) ?? null }) }) }),
            insert: async (r: { day: string; kind: string; reply: unknown }) => {
              state.inserts++;
              if (state.rows.some((x) => x.day === r.day)) return { error: { code: "23505" } };
              state.rows.push(r);
              return { error: null };
            },
          };
        return { select: () => ({ in: async () => ({ data: [] }) }) };
      },
    },
  }),
}));
vi.mock("./offers", () => ({
  findDowngrade: async () => state.down,
  downgradeCard: async () => ({ id: "c1", title: "Make Tempo run easier today", lines: [], status: "proposed" }),
  offerText: () => "Your readiness is red today.",
  loadReview: async () => state.review,
}));

import { getProactive } from "./proactive-actions";

state.today = "2026-11-30";
const red = { readiness: { status: "red", reasons: ["Slept 4.5 h"], day: "2026-11-30" }, workout: { id: "w1" } };
const review = { text: "Your week", lines: ["Training: 3 of 4"] };

beforeEach(() => {
  state.rows = [];
  state.down = null;
  state.review = null;
  state.inserts = 0;
  state.today = "2026-11-30"; // Monday
});

describe("getProactive", () => {
  it("says nothing when there's nothing real to say", async () => {
    expect(await getProactive()).toBeNull();
    expect(state.rows).toHaveLength(0);
  });
  it("sends at most one message a day: the same one every time", async () => {
    state.review = review;
    const a = await getProactive();
    const b = await getProactive();
    expect(a?.kind).toBe("weekly_review");
    expect(b?.reply.text).toBe("Your week");
    expect(state.rows).toHaveLength(1);
    expect(state.inserts).toBe(1);
    // even if something new comes up later in the day, the day's message doesn't change or add a second one
    state.down = red;
    expect((await getProactive())?.kind).toBe("weekly_review");
    expect(state.rows).toHaveLength(1);
  });
  it("red readiness with a hard session beats the Monday review", async () => {
    state.review = review;
    state.down = red;
    const r = await getProactive();
    expect(r?.kind).toBe("readiness");
    expect(r?.reply.actions?.[0].status).toBe("proposed");
  });
  it("only does the weekly review on Mondays", async () => {
    state.today = "2026-12-01";
    state.review = review;
    expect(await getProactive()).toBeNull();
  });
  it("amber readiness with a hard session speaks on a non-Monday", async () => {
    state.today = "2026-12-01";
    state.down = { ...red, readiness: { ...red.readiness, status: "amber" } };
    expect((await getProactive())?.kind).toBe("readiness");
  });
  it("a lost race with another request returns that request's message, not a second one", async () => {
    state.review = review;
    state.rows.push({ day: "2026-11-30", kind: "readiness", reply: { text: "earlier", actions: [] } });
    expect((await getProactive())?.reply.text).toBe("earlier");
    expect(state.rows).toHaveLength(1);
  });
});

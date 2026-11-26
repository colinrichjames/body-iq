import { describe, expect, it } from "vitest";
import { COMMON_FOODS, findCommon } from "./common-foods";
import { foodProblem } from "./food";

describe("common foods", () => {
  it("every entry's calories match its macros", () => {
    for (const f of COMMON_FOODS) expect(foodProblem({ ...f }), f.name).toBeNull();
  });
  it("finds foods by every word typed, and nothing for a nonsense query", () => {
    expect(findCommon("banana").map((f) => f.name)).toEqual(["Banana"]);
    expect(findCommon("chicken breast")[0].name).toBe("Chicken breast (cooked)");
    expect(findCommon("zzzzqq")).toEqual([]);
    expect(findCommon("  ")).toEqual([]);
  });
  it("matches regardless of case and respects the limit", () => {
    expect(findCommon("RICE")[0].name).toBe("White rice (cooked)");
    expect(findCommon("e", 3)).toEqual([]);
    expect(findCommon("cooked", 2)).toHaveLength(2);
  });
});

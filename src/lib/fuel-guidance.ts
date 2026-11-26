import type { DayTargets } from "./targets";

type PerKg = { carbsPerKg: [number, number]; proteinPerKg: [number, number]; carbsG: [number, number] | null; proteinG: [number, number] | null };
type Eaten = { calories: number; protein: number; carbs: number } | null;

export type FuelGuidance = {
  /** "targets" when the user set their own; "guideline" for the generic g/kg range. */
  kind: "targets" | "guideline";
  lines: string[];
};

const pct = (v: number, t: number) => `${Math.round((v / t) * 100)}%`;

/**
 * What the Fuel card says under the numbers. When the user has set their own targets, the guidance is built from them
 * (and how today compares). The generic g/kg range only appears when no carb or protein target exists, and is labelled
 * as a general guideline so it can't be mistaken for a personal target.
 */
export function fuelGuidance(targets: DayTargets, eaten: Eaten, perKg: PerKg): FuelGuidance {
  const hasOwn = targets.carbs !== null || targets.protein !== null || targets.calories !== null;
  if (hasOwn) {
    const parts = [
      targets.calories !== null ? `${Math.round(targets.calories).toLocaleString("en-US")} cal` : null,
      targets.carbs !== null ? `${Math.round(targets.carbs)} g carbs` : null,
      targets.protein !== null ? `${Math.round(targets.protein)} g protein` : null,
      targets.fat !== null ? `${Math.round(targets.fat)} g fat` : null,
    ].filter(Boolean);
    const lines = [`Your targets for today: ${parts.join(", ")}.`];
    if (eaten && eaten.calories > 0) {
      const so: string[] = [];
      if (targets.carbs) so.push(`carbs ${Math.round(eaten.carbs)} of ${Math.round(targets.carbs)} g (${pct(eaten.carbs, targets.carbs)})`);
      if (targets.protein) so.push(`protein ${Math.round(eaten.protein)} of ${Math.round(targets.protein)} g (${pct(eaten.protein, targets.protein)})`);
      if (so.length) lines.push(`So far: ${so.join(", ")}.`);
    }
    return { kind: "targets", lines };
  }
  const carbs = `${perKg.carbsPerKg[0]}-${perKg.carbsPerKg[1]} g/kg${perKg.carbsG ? ` (about ${perKg.carbsG[0]}-${perKg.carbsG[1]} g)` : " (log a body scan to see grams)"}`;
  const protein = `${perKg.proteinPerKg[0]}-${perKg.proteinPerKg[1]} g/kg${perKg.proteinG ? ` (${perKg.proteinG[0]}-${perKg.proteinG[1]} g)` : ""}`;
  return {
    kind: "guideline",
    lines: [`General guideline, not your target: for a day like this, carbs ${carbs}, protein ${protein}. Set your own targets in Fuel to replace this.`],
  };
}

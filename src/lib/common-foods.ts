/**
 * A small local list of everyday foods, per typical serving (rounded USDA-style values), used when food search finds
 * nothing. Picking one opens the add-by-hand form with these numbers filled in, to check and edit. No outside service.
 */
export type CommonFood = { name: string; serving: string; calories: number; protein_g: number; carbs_g: number; fat_g: number };

export const COMMON_FOODS: CommonFood[] = [
  { name: "Banana", serving: "1 medium", calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4 },
  { name: "Apple", serving: "1 medium", calories: 95, protein_g: 0.5, carbs_g: 25, fat_g: 0.3 },
  { name: "Orange", serving: "1 medium", calories: 62, protein_g: 1.2, carbs_g: 15, fat_g: 0.2 },
  { name: "Blueberries", serving: "1 cup", calories: 84, protein_g: 1.1, carbs_g: 21, fat_g: 0.5 },
  { name: "Egg", serving: "1 large", calories: 72, protein_g: 6.3, carbs_g: 0.4, fat_g: 4.8 },
  { name: "Rolled oats (dry)", serving: "1/2 cup (40 g)", calories: 150, protein_g: 5, carbs_g: 27, fat_g: 3 },
  { name: "White rice (cooked)", serving: "1 cup", calories: 205, protein_g: 4.3, carbs_g: 45, fat_g: 0.4 },
  { name: "Pasta (cooked)", serving: "1 cup", calories: 220, protein_g: 8, carbs_g: 43, fat_g: 1.3 },
  { name: "Bread, white", serving: "1 slice", calories: 79, protein_g: 2.7, carbs_g: 15, fat_g: 1 },
  { name: "Bagel, plain", serving: "1 medium", calories: 277, protein_g: 11, carbs_g: 55, fat_g: 1.4 },
  { name: "Flour tortilla", serving: "1 medium", calories: 140, protein_g: 4, carbs_g: 24, fat_g: 3.5 },
  { name: "Potato, baked", serving: "1 medium", calories: 161, protein_g: 4.3, carbs_g: 37, fat_g: 0.2 },
  { name: "Sweet potato, baked", serving: "1 medium", calories: 112, protein_g: 2, carbs_g: 26, fat_g: 0.1 },
  { name: "Chicken breast (cooked)", serving: "100 g", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
  { name: "Ground beef 85% (cooked)", serving: "100 g", calories: 250, protein_g: 26, carbs_g: 0, fat_g: 15 },
  { name: "Salmon (cooked)", serving: "100 g", calories: 206, protein_g: 22, carbs_g: 0, fat_g: 12 },
  { name: "Tuna, canned in water", serving: "100 g", calories: 116, protein_g: 26, carbs_g: 0, fat_g: 0.8 },
  { name: "Tofu, firm", serving: "100 g", calories: 144, protein_g: 17, carbs_g: 3, fat_g: 9 },
  { name: "Whole milk", serving: "1 cup", calories: 149, protein_g: 8, carbs_g: 12, fat_g: 8 },
  { name: "Greek yogurt, plain nonfat", serving: "170 g", calories: 100, protein_g: 17, carbs_g: 6, fat_g: 0.7 },
  { name: "Cottage cheese, low fat", serving: "1 cup", calories: 180, protein_g: 24, carbs_g: 10, fat_g: 5 },
  { name: "Cheddar cheese", serving: "28 g", calories: 113, protein_g: 7, carbs_g: 0.4, fat_g: 9 },
  { name: "Peanut butter", serving: "2 tbsp", calories: 188, protein_g: 8, carbs_g: 6, fat_g: 16 },
  { name: "Almonds", serving: "28 g", calories: 164, protein_g: 6, carbs_g: 6, fat_g: 14 },
  { name: "Avocado", serving: "1/2 medium", calories: 120, protein_g: 1.5, carbs_g: 6.4, fat_g: 11 },
  { name: "Olive oil", serving: "1 tbsp", calories: 119, protein_g: 0, carbs_g: 0, fat_g: 13.5 },
  { name: "Broccoli (cooked)", serving: "1 cup", calories: 55, protein_g: 3.7, carbs_g: 11, fat_g: 0.6 },
  { name: "Black beans (cooked)", serving: "1 cup", calories: 227, protein_g: 15, carbs_g: 41, fat_g: 0.9 },
  { name: "Lentils (cooked)", serving: "1 cup", calories: 230, protein_g: 18, carbs_g: 40, fat_g: 0.8 },
  { name: "Whey protein shake", serving: "1 scoop", calories: 120, protein_g: 24, carbs_g: 3, fat_g: 1.5 },
  { name: "Pizza, cheese", serving: "1 slice", calories: 285, protein_g: 12, carbs_g: 36, fat_g: 10 },
  { name: "Honey", serving: "1 tbsp", calories: 64, protein_g: 0, carbs_g: 17, fat_g: 0 },
];

/** Common foods whose name contains every word typed (at most `limit`). Empty for a blank query. */
export function findCommon(query: string, limit = 5): CommonFood[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
  if (!words.length) return [];
  return COMMON_FOODS.filter((f) => words.every((w) => f.name.toLowerCase().includes(w))).slice(0, limit);
}

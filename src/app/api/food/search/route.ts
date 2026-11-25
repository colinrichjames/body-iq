import { requireUser } from "@/lib/auth";
import { foodFromOff, type Food } from "@/lib/food";

export const dynamic = "force-dynamic";

const UA = "BodyIQ/0.1 (personal training app)";

/** Text search: your saved foods first, then Open Food Facts. */
export async function GET(request: Request) {
  const { supabase } = await requireUser();
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ foods: [] });

  const { data: mine } = await supabase.from("custom_foods").select("*").ilike("name", `%${q.replace(/[%_]/g, "")}%`).limit(8);
  const foods: Food[] = (mine ?? []).map((m) => ({
    source: "custom",
    id: m.id,
    barcode: m.barcode,
    name: m.name,
    brand: m.brand,
    servingLabel: m.serving_label,
    calories: Number(m.calories),
    protein_g: Number(m.protein_g),
    carbs_g: Number(m.carbs_g),
    fat_g: Number(m.fat_g),
    sodium_mg: null,
    sugar_g: null,
    fiber_g: null,
  }));

  let warning: string | null = null;
  try {
    const url =
      "https://world.openfoodfacts.org/cgi/search.pl?" +
      new URLSearchParams({
        search_terms: q,
        search_simple: "1",
        action: "process",
        json: "1",
        page_size: "15",
        fields: "code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments",
      });
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { products?: Parameters<typeof foodFromOff>[0][] };
    for (const p of json.products ?? []) {
      const f = foodFromOff(p);
      if (f) foods.push(f);
    }
  } catch {
    warning = "Open Food Facts search is busy. Your saved foods are shown; try again in a moment.";
  }
  return Response.json({ foods: foods.slice(0, 20), warning });
}

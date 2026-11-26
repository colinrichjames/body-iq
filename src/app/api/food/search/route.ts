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

  const FIELDS = "code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments";
  type Product = Parameters<typeof foodFromOff>[0];
  const get = async (url: string, ms: number) => {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(ms), cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Record<string, unknown>;
  };
  // The newer search service is much faster and steadier; the classic CGI search is the fallback.
  const sources: (() => Promise<Product[]>)[] = [
    async () => {
      const j = await get("https://search.openfoodfacts.org/search?" + new URLSearchParams({ q, page_size: "20", fields: FIELDS }), 5000);
      if (!Array.isArray(j.hits)) throw new Error("shape");
      return j.hits as Product[];
    },
    async () => {
      const j = await get(
        "https://world.openfoodfacts.org/cgi/search.pl?" + new URLSearchParams({ search_terms: q, search_simple: "1", action: "process", json: "1", page_size: "15", fields: FIELDS }),
        6000,
      );
      if (!Array.isArray(j.products)) throw new Error("shape");
      return j.products as Product[];
    },
  ];

  let warning: string | null = "Open Food Facts search is busy. Your saved foods are shown; try again in a moment.";
  for (const run of sources) {
    try {
      const products = await run();
      for (const p of products) {
        const f = foodFromOff(p);
        if (f) foods.push(f);
      }
      warning = null;
      break;
    } catch {
      // try the next source
    }
  }
  return Response.json({ foods: foods.slice(0, 20), warning });
}

import { requireUser } from "@/lib/auth";
import { foodFromOff, isBarcode, type Food } from "@/lib/food";

export const dynamic = "force-dynamic";

const UA = "BodyIQ/0.1 (personal training app)";

/** Barcode lookup: your own saved foods first, then Open Food Facts (free). */
export async function GET(request: Request) {
  const { supabase } = await requireUser();
  const code = (new URL(request.url).searchParams.get("code") ?? "").trim();
  if (!isBarcode(code)) return Response.json({ error: "That doesn't look like a barcode." }, { status: 400 });

  const { data: mine } = await supabase.from("custom_foods").select("*").eq("barcode", code).maybeSingle();
  if (mine) {
    const food: Food = {
      source: "custom",
      id: mine.id,
      barcode: mine.barcode,
      name: mine.name,
      brand: mine.brand,
      servingLabel: mine.serving_label,
      calories: Number(mine.calories),
      protein_g: Number(mine.protein_g),
      carbs_g: Number(mine.carbs_g),
      fat_g: Number(mine.fat_g),
      sodium_mg: null,
      sugar_g: null,
      fiber_g: null,
    };
    return Response.json({ food });
  }

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    if (!res.ok) return Response.json({ food: null, notFound: true });
    const json = (await res.json()) as { status?: number; product?: Parameters<typeof foodFromOff>[0] };
    const food = json.status === 1 && json.product ? foodFromOff({ ...json.product, code }) : null;
    return Response.json(food ? { food } : { food: null, notFound: true });
  } catch {
    return Response.json({ error: "Open Food Facts didn't answer. Try again, or enter it by hand." }, { status: 502 });
  }
}

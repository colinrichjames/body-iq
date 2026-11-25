// MyFitnessPal export parsing. Runs in the browser so only small, per-day totals
// are sent to the server. No Node-only APIs here.

export type NutritionRow = {
  day: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  sodium_mg: number | null;
  sugar_g: number | null;
  fiber_g: number | null;
};

export type ParseResult = {
  rows: NutritionRow[];
  skippedRows: number;
  error?: string;
};

/** Minimal RFC-4180 style CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function toIsoDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

function num(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[, ]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Sums MyFitnessPal "Nutrition Summary" rows (one row per meal per day) into one row per day.
 * Header matching is tolerant of column order and extra columns.
 */
export function aggregateMfp(text: string): ParseResult {
  const table = parseCsv(text);
  const headerIndex = table.findIndex((r) => {
    const h = r.map((c) => c.trim().toLowerCase());
    return h.includes("date") && h.some((c) => c.startsWith("calories"));
  });
  if (headerIndex === -1) {
    return { rows: [], skippedRows: 0, error: "This doesn't look like a MyFitnessPal nutrition export (no Date and Calories columns)." };
  }

  const headers = table[headerIndex].map((c) => c.trim().toLowerCase());
  const find = (pred: (h: string) => boolean) => headers.findIndex(pred);
  const col = {
    date: find((h) => h === "date"),
    meal: find((h) => h === "meal"),
    calories: find((h) => h.startsWith("calories")),
    fat: find((h) => h === "fat (g)" || h === "fat"),
    protein: find((h) => h.startsWith("protein")),
    carbs: find((h) => h.startsWith("carbohydrates") || h.startsWith("carbs")),
    sodium: find((h) => h.startsWith("sodium")),
    sugar: find((h) => h.startsWith("sugar")),
    fiber: find((h) => h.startsWith("fiber") || h.startsWith("fibre")),
  };

  type Acc = Record<keyof Omit<NutritionRow, "day">, number | null>;
  const days = new Map<string, Acc>();
  let skipped = 0;

  const add = (acc: Acc, key: keyof Acc, value: number | null) => {
    if (value === null) return;
    acc[key] = (acc[key] ?? 0) + value;
  };

  for (const r of table.slice(headerIndex + 1)) {
    const day = toIsoDate(r[col.date] ?? "");
    const meal = col.meal >= 0 ? (r[col.meal] ?? "").toLowerCase() : "";
    if (!day || /total/.test(meal)) {
      skipped++;
      continue;
    }
    const acc =
      days.get(day) ??
      ({ calories: null, protein_g: null, carbs_g: null, fat_g: null, sodium_mg: null, sugar_g: null, fiber_g: null } as Acc);
    add(acc, "calories", col.calories >= 0 ? num(r[col.calories]) : null);
    add(acc, "protein_g", col.protein >= 0 ? num(r[col.protein]) : null);
    add(acc, "carbs_g", col.carbs >= 0 ? num(r[col.carbs]) : null);
    add(acc, "fat_g", col.fat >= 0 ? num(r[col.fat]) : null);
    add(acc, "sodium_mg", col.sodium >= 0 ? num(r[col.sodium]) : null);
    add(acc, "sugar_g", col.sugar >= 0 ? num(r[col.sugar]) : null);
    add(acc, "fiber_g", col.fiber >= 0 ? num(r[col.fiber]) : null);
    days.set(day, acc);
  }

  const rows: NutritionRow[] = [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, a]) => ({
      day,
      calories: a.calories === null ? null : Math.round(a.calories * 10) / 10,
      protein_g: a.protein_g === null ? null : Math.round(a.protein_g * 10) / 10,
      carbs_g: a.carbs_g === null ? null : Math.round(a.carbs_g * 10) / 10,
      fat_g: a.fat_g === null ? null : Math.round(a.fat_g * 10) / 10,
      sodium_mg: a.sodium_mg === null ? null : Math.round(a.sodium_mg * 10) / 10,
      sugar_g: a.sugar_g === null ? null : Math.round(a.sugar_g * 10) / 10,
      fiber_g: a.fiber_g === null ? null : Math.round(a.fiber_g * 10) / 10,
    }))
    // A day with no calories logged is a logging gap, not a 0-calorie day.
    .filter((r) => r.calories !== null && r.calories > 0);

  if (rows.length === 0) {
    return { rows: [], skippedRows: skipped, error: "No days with logged calories were found in this file." };
  }
  return { rows, skippedRows: skipped };
}

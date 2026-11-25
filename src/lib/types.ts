export type ScanSource = "inbody" | "dexa" | "scale" | "manual";

export type BodyScan = {
  id: string;
  user_id: string;
  scanned_at: string;
  source: ScanSource;
  weight_lb: number | null;
  body_fat_pct: number | null;
  skeletal_muscle_lb: number | null;
  fat_mass_lb: number | null;
  notes: string | null;
  created_at: string;
};

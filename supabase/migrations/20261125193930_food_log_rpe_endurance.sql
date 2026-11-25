-- Unified logging: per-set RPE, endurance result fields, meal-level food log, custom foods.

alter table public.workout_sets add column rpe numeric(3, 1) check (rpe is null or (rpe >= 1 and rpe <= 10));

alter table public.workouts
  add column avg_hr integer check (avg_hr is null or avg_hr between 30 and 250),
  add column avg_power integer check (avg_power is null or avg_power between 0 and 3000),
  add column activity_id uuid references public.activities (id) on delete set null;

-- Custom foods (also remembers barcodes Open Food Facts doesn't have). Values are per serving.
create table public.custom_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  barcode text check (barcode is null or char_length(barcode) between 6 and 20),
  name text not null check (char_length(name) between 1 and 160),
  brand text check (brand is null or char_length(brand) <= 120),
  serving_label text not null default '1 serving' check (char_length(serving_label) <= 60),
  calories numeric(7, 1) not null check (calories >= 0),
  protein_g numeric(6, 1) not null default 0 check (protein_g >= 0),
  carbs_g numeric(6, 1) not null default 0 check (carbs_g >= 0),
  fat_g numeric(6, 1) not null default 0 check (fat_g >= 0),
  created_at timestamptz not null default now()
);
create unique index custom_foods_user_barcode_idx on public.custom_foods (user_id, barcode) where barcode is not null;
alter table public.custom_foods enable row level security;
create policy "custom_foods_select_own" on public.custom_foods for select to authenticated using ((select auth.uid()) = user_id);
create policy "custom_foods_insert_own" on public.custom_foods for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "custom_foods_update_own" on public.custom_foods for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "custom_foods_delete_own" on public.custom_foods for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.custom_foods from anon;
grant select, insert, update, delete on public.custom_foods to authenticated;

-- One row per food eaten. Totals are for the whole entry (servings already applied).
create table public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  meal text not null default 'snack' check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null check (char_length(name) between 1 and 160),
  brand text check (brand is null or char_length(brand) <= 120),
  barcode text check (barcode is null or char_length(barcode) <= 20),
  amount_label text check (amount_label is null or char_length(amount_label) <= 60),
  calories numeric(7, 1) not null check (calories >= 0),
  protein_g numeric(6, 1) not null default 0 check (protein_g >= 0),
  carbs_g numeric(6, 1) not null default 0 check (carbs_g >= 0),
  fat_g numeric(6, 1) not null default 0 check (fat_g >= 0),
  sodium_mg numeric(7, 1) check (sodium_mg is null or sodium_mg >= 0),
  sugar_g numeric(6, 1) check (sugar_g is null or sugar_g >= 0),
  fiber_g numeric(6, 1) check (fiber_g is null or fiber_g >= 0),
  created_at timestamptz not null default now()
);
create index food_entries_user_day_idx on public.food_entries (user_id, day);
alter table public.food_entries enable row level security;
create policy "food_entries_select_own" on public.food_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy "food_entries_insert_own" on public.food_entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "food_entries_update_own" on public.food_entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "food_entries_delete_own" on public.food_entries for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.food_entries from anon;
grant select, insert, update, delete on public.food_entries to authenticated;

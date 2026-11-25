-- Saved foods: favourites (one food), meals (several foods logged together) and recipes (ingredients split into portions).
-- items is an array of { name, brand, amount_label, calories, protein_g, carbs_g, fat_g, sodium_mg, sugar_g, fiber_g }.
create table public.saved_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('favorite', 'meal', 'recipe')),
  name text not null check (char_length(name) between 1 and 120),
  portions numeric(5, 2) not null default 1 check (portions > 0 and portions <= 100),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 60),
  created_at timestamptz not null default now()
);
create unique index saved_foods_user_kind_name_idx on public.saved_foods (user_id, kind, lower(name));
alter table public.saved_foods enable row level security;
create policy "saved_foods_select_own" on public.saved_foods for select to authenticated using ((select auth.uid()) = user_id);
create policy "saved_foods_insert_own" on public.saved_foods for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saved_foods_update_own" on public.saved_foods for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "saved_foods_delete_own" on public.saved_foods for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.saved_foods from anon;
grant select, insert, update, delete on public.saved_foods to authenticated;

-- A day the user marked as fully logged ("Finish day"). Streaks count these.
create table public.day_finishes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  finished_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.day_finishes enable row level security;
create policy "day_finishes_select_own" on public.day_finishes for select to authenticated using ((select auth.uid()) = user_id);
create policy "day_finishes_insert_own" on public.day_finishes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "day_finishes_delete_own" on public.day_finishes for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.day_finishes from anon;
grant select, insert, delete on public.day_finishes to authenticated;

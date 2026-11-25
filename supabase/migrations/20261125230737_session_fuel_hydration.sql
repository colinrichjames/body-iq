-- What you actually took in during a session, and daily water.
alter table public.workouts
  add column fuel_carbs_g numeric(6, 1) check (fuel_carbs_g is null or (fuel_carbs_g >= 0 and fuel_carbs_g <= 1000)),
  add column fluid_ml integer check (fluid_ml is null or (fluid_ml >= 0 and fluid_ml <= 10000)),
  add column sodium_mg integer check (sodium_mg is null or (sodium_mg >= 0 and sodium_mg <= 20000));

create table public.hydration_days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  ml integer not null default 0 check (ml >= 0 and ml <= 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.hydration_days enable row level security;
create policy "hydration_days_select_own" on public.hydration_days for select to authenticated using ((select auth.uid()) = user_id);
create policy "hydration_days_insert_own" on public.hydration_days for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "hydration_days_update_own" on public.hydration_days for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "hydration_days_delete_own" on public.hydration_days for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.hydration_days from anon;
grant select, insert, update, delete on public.hydration_days to authenticated;

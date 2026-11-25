-- Body IQ: initial schema
-- Tables: profiles, body_scans. Every table has RLS enabled, and access is
-- granted explicitly to the `authenticated` role only (nothing for `anon`).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  unit_system text not null default 'imperial'
    check (unit_system in ('imperial', 'metric')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- body_scans: InBody / DEXA / scale / manual body-composition readings
-- Weights are stored in pounds for now; add a metric view or conversion
-- layer when unit_system = 'metric' is supported in the UI.
-- ---------------------------------------------------------------------------
create table public.body_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  scanned_at timestamptz not null default now(),
  source text not null default 'inbody'
    check (source in ('inbody', 'dexa', 'scale', 'manual')),
  weight_lb numeric(5, 1) check (weight_lb is null or weight_lb > 0),
  body_fat_pct numeric(4, 1)
    check (body_fat_pct is null or (body_fat_pct >= 0 and body_fat_pct <= 100)),
  skeletal_muscle_lb numeric(5, 1)
    check (skeletal_muscle_lb is null or skeletal_muscle_lb > 0),
  fat_mass_lb numeric(5, 1) check (fat_mass_lb is null or fat_mass_lb >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create index body_scans_user_scanned_at_idx
  on public.body_scans (user_id, scanned_at desc);

alter table public.body_scans enable row level security;

create policy "body_scans_select_own" on public.body_scans
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "body_scans_insert_own" on public.body_scans
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "body_scans_update_own" on public.body_scans
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "body_scans_delete_own" on public.body_scans
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.body_scans from anon;
grant select, insert, update, delete on public.body_scans to authenticated;

-- Phase 1 (project scope v2.0). Additive only. RLS on every table.
-- Garmin tables are read-only for signed-in users; the sync Edge Function
-- writes with the service role.

alter table public.races
  add column priority text not null default 'B' check (priority in ('A','B','C')),
  add column goal_time_sec integer check (goal_time_sec is null or goal_time_sec > 0);

-- Existing columns stay the training-day targets; these are the rest-day targets.
alter table public.profiles
  add column rest_calorie_target integer,
  add column rest_protein_g integer,
  add column rest_carbs_g integer,
  add column rest_fat_g integer;

create table public.hyrox_benchmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  station text not null check (station in (
    'run_1km','skierg','sled_push','sled_pull','burpee_broad_jump','row','farmers_carry','sandbag_lunges','wall_balls'
  )),
  effort_date date not null default current_date,
  time_sec integer not null check (time_sec > 0),
  notes text,
  created_at timestamptz not null default now()
);
create index hyrox_benchmarks_user_station_idx on public.hyrox_benchmarks (user_id, station, effort_date desc);
alter table public.hyrox_benchmarks enable row level security;
create policy "hyrox_benchmarks_select_own" on public.hyrox_benchmarks for select to authenticated using ((select auth.uid()) = user_id);
create policy "hyrox_benchmarks_insert_own" on public.hyrox_benchmarks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "hyrox_benchmarks_update_own" on public.hyrox_benchmarks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "hyrox_benchmarks_delete_own" on public.hyrox_benchmarks for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.hyrox_benchmarks from anon;
grant select, insert, update, delete on public.hyrox_benchmarks to authenticated;

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  garmin_id text not null,
  sport text,
  title text,
  started_at timestamptz not null,
  duration_sec integer,
  distance_m numeric,
  avg_hr integer,
  max_hr integer,
  avg_power integer,
  training_load numeric,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, garmin_id)
);
create index activities_user_started_idx on public.activities (user_id, started_at desc);
alter table public.activities enable row level security;
create policy "activities_select_own" on public.activities for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.activities from anon;
grant select on public.activities to authenticated;

create table public.daily_health (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  sleep_seconds integer,
  sleep_score integer,
  hrv_ms numeric,
  resting_hr integer,
  body_battery_max integer,
  body_battery_min integer,
  stress_avg integer,
  steps integer,
  raw_json jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_health enable row level security;
create policy "daily_health_select_own" on public.daily_health for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.daily_health from anon;
grant select on public.daily_health to authenticated;

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null default 'garmin',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','success','error')),
  items integer,
  error text
);
create index sync_runs_user_started_idx on public.sync_runs (user_id, started_at desc);
alter table public.sync_runs enable row level security;
create policy "sync_runs_select_own" on public.sync_runs for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.sync_runs from anon;
grant select on public.sync_runs to authenticated;

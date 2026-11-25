-- Body IQ: races, workouts, workout sets, nutrition days, nutrition targets.
-- Additive only. Every table has RLS enabled and access is granted to the
-- `authenticated` role only.

-- ---------------------------------------------------------------------------
-- profiles: daily nutrition targets
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column calorie_target integer
    check (calorie_target is null or calorie_target between 800 and 8000),
  add column protein_target_g integer
    check (protein_target_g is null or protein_target_g between 0 and 500),
  add column carbs_target_g integer
    check (carbs_target_g is null or carbs_target_g between 0 and 1500),
  add column fat_target_g integer
    check (fat_target_g is null or fat_target_g between 0 and 500);

-- ---------------------------------------------------------------------------
-- races
-- ---------------------------------------------------------------------------
create table public.races (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  race_type text not null check (race_type in (
    'marathon', 'half_marathon', '10k', '5k',
    'triathlon_sprint', 'triathlon_olympic', 'triathlon_70_3', 'triathlon_140_6',
    'hyrox_single', 'hyrox_doubles'
  )),
  race_date date not null,
  location text,
  goal text,
  created_at timestamptz not null default now()
);

create index races_user_date_idx on public.races (user_id, race_date);
alter table public.races enable row level security;

create policy "races_select_own" on public.races
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "races_insert_own" on public.races
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "races_update_own" on public.races
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "races_delete_own" on public.races
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.races from anon;
grant select, insert, update, delete on public.races to authenticated;

-- ---------------------------------------------------------------------------
-- workouts: planned, completed or skipped sessions
-- ---------------------------------------------------------------------------
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  workout_date date not null,
  sport text not null check (sport in (
    'strength', 'run', 'bike', 'swim', 'hyrox', 'mobility', 'other'
  )),
  title text not null check (char_length(title) between 1 and 160),
  description text,
  planned_duration_min integer check (planned_duration_min is null or planned_duration_min > 0),
  structure jsonb,
  status text not null default 'planned'
    check (status in ('planned', 'completed', 'skipped')),
  race_id uuid references public.races (id) on delete set null,
  generated boolean not null default false,
  actual_duration_min integer check (actual_duration_min is null or actual_duration_min >= 0),
  actual_distance_km numeric(6, 2) check (actual_distance_km is null or actual_distance_km >= 0),
  rpe integer check (rpe is null or rpe between 1 and 10),
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index workouts_user_date_idx on public.workouts (user_id, workout_date);
create index workouts_race_idx on public.workouts (race_id);
alter table public.workouts enable row level security;

create policy "workouts_select_own" on public.workouts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "workouts_insert_own" on public.workouts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "workouts_update_own" on public.workouts
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "workouts_delete_own" on public.workouts
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.workouts from anon;
grant select, insert, update, delete on public.workouts to authenticated;

-- ---------------------------------------------------------------------------
-- workout_sets: logged sets from the in-workout assistant
-- ---------------------------------------------------------------------------
create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise text not null check (char_length(exercise) between 1 and 120),
  set_number integer not null check (set_number > 0),
  reps integer check (reps is null or reps >= 0),
  weight_lb numeric(6, 1) check (weight_lb is null or weight_lb >= 0),
  created_at timestamptz not null default now()
);

create index workout_sets_workout_idx on public.workout_sets (workout_id);
create index workout_sets_user_exercise_idx on public.workout_sets (user_id, exercise, created_at desc);
alter table public.workout_sets enable row level security;

create policy "workout_sets_select_own" on public.workout_sets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "workout_sets_insert_own" on public.workout_sets
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.workouts w
      where w.id = workout_id and w.user_id = (select auth.uid())
    )
  );
create policy "workout_sets_update_own" on public.workout_sets
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "workout_sets_delete_own" on public.workout_sets
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.workout_sets from anon;
grant select, insert, update, delete on public.workout_sets to authenticated;

-- ---------------------------------------------------------------------------
-- nutrition_days: one row per user per day (MyFitnessPal import)
-- ---------------------------------------------------------------------------
create table public.nutrition_days (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  day date not null,
  calories numeric(7, 1) check (calories is null or calories >= 0),
  protein_g numeric(6, 1) check (protein_g is null or protein_g >= 0),
  carbs_g numeric(6, 1) check (carbs_g is null or carbs_g >= 0),
  fat_g numeric(6, 1) check (fat_g is null or fat_g >= 0),
  sodium_mg numeric(7, 1) check (sodium_mg is null or sodium_mg >= 0),
  sugar_g numeric(6, 1) check (sugar_g is null or sugar_g >= 0),
  fiber_g numeric(6, 1) check (fiber_g is null or fiber_g >= 0),
  source text not null default 'myfitnesspal',
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.nutrition_days enable row level security;

create policy "nutrition_days_select_own" on public.nutrition_days
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "nutrition_days_insert_own" on public.nutrition_days
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "nutrition_days_update_own" on public.nutrition_days
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "nutrition_days_delete_own" on public.nutrition_days
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger nutrition_days_set_updated_at
  before update on public.nutrition_days
  for each row execute function public.set_updated_at();

revoke all on public.nutrition_days from anon;
grant select, insert, update, delete on public.nutrition_days to authenticated;

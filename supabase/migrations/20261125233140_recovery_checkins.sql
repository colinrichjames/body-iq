create table public.recovery_checkins (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  sleep_hours numeric(3, 1) check (sleep_hours is null or (sleep_hours >= 0 and sleep_hours <= 16)),
  soreness smallint check (soreness is null or soreness between 1 and 5),
  energy smallint check (energy is null or energy between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.recovery_checkins enable row level security;
create policy "recovery_checkins_select_own" on public.recovery_checkins for select to authenticated using ((select auth.uid()) = user_id);
create policy "recovery_checkins_insert_own" on public.recovery_checkins for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "recovery_checkins_update_own" on public.recovery_checkins for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "recovery_checkins_delete_own" on public.recovery_checkins for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.recovery_checkins from anon;
grant select, insert, update, delete on public.recovery_checkins to authenticated;

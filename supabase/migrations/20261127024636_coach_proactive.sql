-- One proactive coach message per user per day (the unique key enforces the cap). reply holds the saved message and
-- the ids of any action cards in it.
create table public.coach_proactive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  kind text not null,
  reply jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
alter table public.coach_proactive enable row level security;
create policy "coach_proactive select own" on public.coach_proactive for select to authenticated using ((select auth.uid()) = user_id);
create policy "coach_proactive insert own" on public.coach_proactive for insert to authenticated with check ((select auth.uid()) = user_id);
grant select, insert on public.coach_proactive to authenticated;

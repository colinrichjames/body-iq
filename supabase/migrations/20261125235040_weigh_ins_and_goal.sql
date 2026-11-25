create table public.weigh_ins (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  weight_lb numeric(5, 1) not null check (weight_lb > 50 and weight_lb < 700),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.weigh_ins enable row level security;
create policy "weigh_ins_select_own" on public.weigh_ins for select to authenticated using ((select auth.uid()) = user_id);
create policy "weigh_ins_insert_own" on public.weigh_ins for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "weigh_ins_update_own" on public.weigh_ins for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "weigh_ins_delete_own" on public.weigh_ins for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.weigh_ins from anon;
grant select, insert, update, delete on public.weigh_ins to authenticated;

alter table public.profiles
  add column goal_mode text check (goal_mode is null or goal_mode in ('lose', 'maintain', 'gain')),
  add column goal_rate_lb_week numeric(3, 2) check (goal_rate_lb_week is null or (goal_rate_lb_week >= 0 and goal_rate_lb_week <= 2)),
  add column coach_checked_at date;

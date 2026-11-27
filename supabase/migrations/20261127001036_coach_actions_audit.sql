-- Audit log of every change the coach proposed: proposed, applied, dismissed, undone or failed. Never deleted by the app.
create table public.coach_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  summary text not null,
  params jsonb not null default '{}'::jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'applied', 'dismissed', 'undone', 'failed')),
  result text,
  undo jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index coach_actions_user_created_idx on public.coach_actions (user_id, created_at desc);
alter table public.coach_actions enable row level security;
create policy "coach_actions_select_own" on public.coach_actions for select to authenticated using ((select auth.uid()) = user_id);
create policy "coach_actions_insert_own" on public.coach_actions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "coach_actions_update_own" on public.coach_actions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.coach_actions to authenticated;
comment on table public.coach_actions is 'Audit log of every change the coach proposed: proposed, applied, dismissed, undone or failed. Never deleted by the app.';

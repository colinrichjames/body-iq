-- Holds deleted rows for 7 days so a delete can be undone. Rows are copied here before the delete.
create table public.trash (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('workout', 'scan', 'race', 'benchmark', 'food_entry')),
  label text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index trash_user_created_idx on public.trash (user_id, created_at desc);
alter table public.trash enable row level security;
create policy "trash_select_own" on public.trash for select to authenticated using ((select auth.uid()) = user_id);
create policy "trash_insert_own" on public.trash for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "trash_delete_own" on public.trash for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, delete on public.trash to authenticated;

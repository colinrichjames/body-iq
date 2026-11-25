-- Write-only secret store: signed-in users can insert/delete their key but can never read it back.
-- Only user_id is selectable (needed for RLS-filtered deletes). The sync Edge Function reads api_key with the service role.
create table public.garmin_credentials (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  api_key text not null check (length(api_key) between 10 and 1000),
  created_at timestamptz not null default now()
);
alter table public.garmin_credentials enable row level security;
create policy "garmin_credentials_select_own" on public.garmin_credentials for select to authenticated using ((select auth.uid()) = user_id);
create policy "garmin_credentials_insert_own" on public.garmin_credentials for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "garmin_credentials_delete_own" on public.garmin_credentials for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.garmin_credentials from anon, authenticated;
grant insert, delete on public.garmin_credentials to authenticated;
grant select (user_id) on public.garmin_credentials to authenticated;

-- Non-secret connection status the UI can read.
create table public.garmin_connections (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  key_last4 text not null,
  expires_on date not null,
  verified boolean not null default false,
  connected_at timestamptz not null default now()
);
alter table public.garmin_connections enable row level security;
create policy "garmin_connections_select_own" on public.garmin_connections for select to authenticated using ((select auth.uid()) = user_id);
create policy "garmin_connections_insert_own" on public.garmin_connections for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "garmin_connections_delete_own" on public.garmin_connections for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.garmin_connections from anon, authenticated;
grant select, insert, delete on public.garmin_connections to authenticated;

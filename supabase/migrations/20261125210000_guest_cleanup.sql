-- Guests are anonymous Supabase users. Their data is temporary: deleting the auth user cascades to every table.

create or replace function public.delete_guest_self()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only an anonymous (guest) session may delete itself; real accounts are never touched.
  if auth.uid() is null or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true' then
    raise exception 'Only guest sessions can be deleted this way';
  end if;
  delete from auth.users where id = auth.uid() and is_anonymous;
end;
$$;

revoke execute on function public.delete_guest_self() from public, anon;
grant execute on function public.delete_guest_self() to authenticated;

-- Hourly sweep: any guest account older than 24 hours is deleted along with all its data.
create or replace function public.purge_old_guests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from auth.users where is_anonymous and created_at < now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.purge_old_guests() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('purge-old-guests', '17 * * * *', $$select public.purge_old_guests()$$);

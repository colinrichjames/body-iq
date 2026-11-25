-- The garmin-sync Edge Function runs as service_role, which had no table privileges here.
grant select on public.garmin_credentials to service_role;
grant select on public.garmin_connections to service_role;
grant select, insert, update on public.sync_runs to service_role;
grant select, insert, update on public.daily_health to service_role;
grant select, insert, update on public.activities to service_role;

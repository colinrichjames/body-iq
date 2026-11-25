-- In-progress sessions: a new status plus where the player left off.
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.workouts'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%planned%';
  if c is not null then execute format('alter table public.workouts drop constraint %I', c); end if;
end $$;

alter table public.workouts
  add constraint workouts_status_check check (status in ('planned', 'in_progress', 'completed', 'skipped')),
  add column progress jsonb;

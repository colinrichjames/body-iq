-- A plan rebuild moves the sessions it removes into the trash so they can be put back.
alter table public.trash drop constraint if exists trash_kind_check;
alter table public.trash add constraint trash_kind_check check (kind in ('workout', 'scan', 'race', 'benchmark', 'food_entry', 'plan_sessions'));

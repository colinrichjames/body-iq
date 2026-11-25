-- Keep four decimals of km so a distance typed in miles (3.1 mi) converts back to 3.1 instead of 3.0999.
alter table public.workouts alter column actual_distance_km type numeric(9, 4);
alter table public.workouts add column if not exists planned_distance_km numeric(9, 4)
  check (planned_distance_km is null or planned_distance_km >= 0);
alter table public.workouts add column if not exists distance_unit text not null default 'mi'
  check (distance_unit in ('mi', 'km'));

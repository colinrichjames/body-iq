-- Skipped sets stay visible in history; block (HYROX/endurance) results are stored per session.
alter table public.workout_sets add column skipped boolean not null default false;
alter table public.workouts add column block_results jsonb;

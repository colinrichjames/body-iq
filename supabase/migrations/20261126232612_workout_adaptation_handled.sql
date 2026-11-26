-- When the user accepted or dismissed the coach's offer about a skipped or missed session, so it is only offered once.
alter table public.workouts add column if not exists adaptation_handled_at timestamptz;

alter table public.workout_sets add column if not exists note text check (note is null or char_length(note) <= 200);

alter table public.profiles
  add column if not exists goal_type text
  check (goal_type is null or goal_type in ('lose_weight', 'lose_fat', 'build_muscle', 'maintain', 'performance', 'gain_weight'));

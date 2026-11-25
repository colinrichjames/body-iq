-- One food log: food_entries is the only place food is recorded. nutrition_days is a rollup of it.
-- Day totals (quick add, MyFitnessPal import) become entries in 'other' with a source tag.
alter table public.food_entries drop constraint food_entries_meal_check;
alter table public.food_entries add constraint food_entries_meal_check
  check (meal in ('breakfast', 'lunch', 'dinner', 'snack', 'other'));

alter table public.food_entries
  add column source text not null default 'logged'
  check (source in ('logged', 'manual', 'myfitnesspal'));

-- Keep every total that exists today: days entered by hand or imported with no foods logged on them.
insert into public.food_entries (user_id, day, meal, name, amount_label, calories, protein_g, carbs_g, fat_g, sodium_mg, sugar_g, fiber_g, source)
select n.user_id, n.day, 'other',
       case n.source when 'manual' then 'Quick add (day total)' else 'MyFitnessPal (day total)' end,
       'whole day',
       coalesce(n.calories, 0), coalesce(n.protein_g, 0), coalesce(n.carbs_g, 0), coalesce(n.fat_g, 0),
       n.sodium_mg, n.sugar_g, n.fiber_g, n.source
from public.nutrition_days n
where n.source in ('manual', 'myfitnesspal')
  and not exists (select 1 from public.food_entries f where f.user_id = n.user_id and f.day = n.day);

create index food_entries_user_day_source_idx on public.food_entries (user_id, day, source);

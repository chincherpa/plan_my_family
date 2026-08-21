-- supabase/migrations/007_meals_free_text.sql
--
-- Meal planning is a free-text dish name per day, not a recipe database.
-- Two competing models had been developed in parallel (recipes + meal_plans
-- vs. meals); this migration settles on `meals` and removes the other.
--
-- WARNING: dropping meal_plans and recipes discards any recipe data in them.

create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  date date not null,
  lunch text,
  dinner text,
  created_at timestamptz not null default now(),
  unique (family_id, date)
);

alter table meals enable row level security;

drop policy if exists "family members can manage meals" on meals;
create policy "family members can manage meals" on meals
  for all using (is_family_member(family_id)) with check (is_family_member(family_id));

-- Carry over whatever was already planned via the recipe model, so no
-- existing plan is lost when the tables go.
do $$
begin
  if to_regclass('public.meal_plans') is not null
     and to_regclass('public.recipes') is not null then
    insert into meals (family_id, date, lunch, dinner)
    select
      mp.family_id,
      mp.date,
      max(r.name) filter (where mp.meal_type = 'lunch'),
      max(r.name) filter (where mp.meal_type = 'dinner')
    from meal_plans mp
    join recipes r on r.id = mp.recipe_id
    group by mp.family_id, mp.date
    on conflict (family_id, date) do nothing;
  end if;
end $$;

drop table if exists meal_plans;
drop table if exists recipes;

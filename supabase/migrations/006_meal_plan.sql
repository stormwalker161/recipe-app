-- Weekly Meal Planner feature.
-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / DROP ... IF EXISTS).

create extension if not exists "pgcrypto";

create table if not exists public.meal_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- NOTE: `public.recipes.id` is `text` (client-generated on insert, no
  -- server-side default -- see useRecipeStore.js), not `uuid`. This column
  -- has to match that type for the foreign key below to actually work, so
  -- it's `text` here rather than the `uuid` originally specified.
  recipe_id text not null references public.recipes(id) on delete cascade,
  day_of_week text not null,
  meal_type text not null default 'Dinner',
  created_at timestamptz not null default now()
);

-- Catches typos/bugs early rather than silently storing a day that will
-- never show up in the 7-day planner UI.
alter table public.meal_plan drop constraint if exists meal_plan_day_of_week_check;
alter table public.meal_plan add constraint meal_plan_day_of_week_check
  check (day_of_week in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'));

alter table public.meal_plan enable row level security;

drop policy if exists "Users can view their own meal plan" on public.meal_plan;
create policy "Users can view their own meal plan"
  on public.meal_plan for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own meal plan entries" on public.meal_plan;
create policy "Users can insert their own meal plan entries"
  on public.meal_plan for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own meal plan entries" on public.meal_plan;
create policy "Users can update their own meal plan entries"
  on public.meal_plan for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own meal plan entries" on public.meal_plan;
create policy "Users can delete their own meal plan entries"
  on public.meal_plan for delete
  using (auth.uid() = user_id);

-- Speeds up "my meal plan, grouped by day" (the exact query the app runs)
-- and the FK-cascade delete when a recipe is removed.
create index if not exists meal_plan_user_id_day_idx
  on public.meal_plan (user_id, day_of_week);

create index if not exists meal_plan_recipe_id_idx
  on public.meal_plan (recipe_id);

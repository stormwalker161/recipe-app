-- Adds multi-week support to the Weekly Meal Planner.
-- Previously every entry was keyed only by a bare day-of-week name (e.g.
-- "Monday"), so there was no way to tell *this* Monday's plan apart from
-- *next* Monday's -- they'd all show up mixed together. Each entry now also
-- stores the Monday date that starts its week, so the planner can show and
-- schedule any number of separate weeks.
-- Safe to re-run: every statement is idempotent.

alter table public.meal_plan
  add column if not exists week_start_date date not null default (date_trunc('week', current_date))::date;

-- Replaces the old (user_id, day_of_week) index -- lookups/filters are now
-- always scoped to a specific week too (the exact query the app runs).
drop index if exists public.meal_plan_user_id_day_idx;
create index if not exists meal_plan_user_id_week_day_idx
  on public.meal_plan (user_id, week_start_date, day_of_week);

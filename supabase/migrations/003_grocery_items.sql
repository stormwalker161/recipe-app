-- Grocery Shopping List feature
-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / DROP ... IF EXISTS).

-- gen_random_uuid() lives in pgcrypto; Supabase projects normally already
-- have this enabled (auth.users uses it), but guard it just in case.
create extension if not exists "pgcrypto";

create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ingredient text not null,
  amount text,
  is_completed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.grocery_items enable row level security;

-- Anyone signed in can see their own list (no approval gate needed just to
-- view/manage a personal grocery list -- unlike recipes, this never calls
-- the Gemini proxy, so there's no quota to protect here).
drop policy if exists "Users can view their own grocery items" on public.grocery_items;
create policy "Users can view their own grocery items"
  on public.grocery_items for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own grocery items" on public.grocery_items;
create policy "Users can insert their own grocery items"
  on public.grocery_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own grocery items" on public.grocery_items;
create policy "Users can update their own grocery items"
  on public.grocery_items for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own grocery items" on public.grocery_items;
create policy "Users can delete their own grocery items"
  on public.grocery_items for delete
  using (auth.uid() = user_id);

-- Speeds up "my items, oldest first" (the exact query the app runs) and the
-- bulk "clear completed" delete.
create index if not exists grocery_items_user_id_created_at_idx
  on public.grocery_items (user_id, created_at);

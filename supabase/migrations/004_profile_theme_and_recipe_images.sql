-- Per-user color theme preference + a Storage bucket for recipe photos.
-- Safe to re-run: every statement is idempotent.

alter table public.profiles
  add column if not exists theme_key text not null default 'coral';

-- Recipe photos: a public-read bucket (so <Image> can load the URL directly
-- with no auth header) but writes are restricted to each user's own folder
-- ("<user_id>/...") via the policies below.
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;

drop policy if exists "Recipe images are publicly readable" on storage.objects;
create policy "Recipe images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'recipe-images');

drop policy if exists "Users can upload their own recipe images" on storage.objects;
create policy "Users can upload their own recipe images"
  on storage.objects for insert
  with check (
    bucket_id = 'recipe-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own recipe images" on storage.objects;
create policy "Users can update their own recipe images"
  on storage.objects for update
  using (
    bucket_id = 'recipe-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own recipe images" on storage.objects;
create policy "Users can delete their own recipe images"
  on storage.objects for delete
  using (
    bucket_id = 'recipe-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

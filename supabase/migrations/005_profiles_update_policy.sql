-- profiles had no UPDATE policy at all, so client-side writes (e.g. saving a
-- theme preference) were silently no-ops under RLS -- PostgREST reports
-- success with zero rows affected rather than an error. Add one, but guard
-- `is_approved` with a trigger so a signed-in user still can't flip their
-- own approval status through this new policy; only privileged connections
-- (this app's direct Postgres/admin access, which has no
-- request.jwt.claim.role of 'authenticated') can change that column.

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.lock_is_approved_for_self_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_approved is distinct from old.is_approved
     and coalesce(current_setting('request.jwt.claim.role', true), '') = 'authenticated' then
    new.is_approved := old.is_approved;
  end if;
  return new;
end;
$$;

drop trigger if exists lock_is_approved_trigger on public.profiles;
create trigger lock_is_approved_trigger
  before update on public.profiles
  for each row
  execute function public.lock_is_approved_for_self_updates();

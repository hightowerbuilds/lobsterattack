-- BusterClaws usernames: one display name per account, shown in the feed.
--
-- A profile row is keyed by the auth user id, so a username change is retroactive
-- — every past and future post by that author renders the new name (the feed
-- joins author_id -> buster_profiles.id at read time). Usernames are display
-- labels only: NOT unique. Reads are public; a user can only write their own row.
--
-- Same dual write path as buster_posts: the human front page upserts directly via
-- the browser client; the API (`PUT /api/profile`) verifies the password with the
-- anon client and upserts as that same user. RLS applies in both paths.

create table if not exists public.buster_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 1 and 40),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.buster_profiles enable row level security;

drop policy if exists "buster_profiles_public_read" on public.buster_profiles;
create policy "buster_profiles_public_read"
on public.buster_profiles
for select
using (true);

drop policy if exists "buster_profiles_insert_own" on public.buster_profiles;
create policy "buster_profiles_insert_own"
on public.buster_profiles
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = id);

drop policy if exists "buster_profiles_update_own" on public.buster_profiles;
create policy "buster_profiles_update_own"
on public.buster_profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Keep updated_at honest on every change.
create or replace function public.buster_profiles_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists buster_profiles_set_updated_at on public.buster_profiles;
create trigger buster_profiles_set_updated_at
  before update on public.buster_profiles
  for each row
  execute function public.buster_profiles_touch_updated_at();

-- Realtime so a rename propagates to open feeds immediately.
alter publication supabase_realtime add table public.buster_profiles;

-- BusterClaws front page: a simple posts feed.
--
-- Authentication is real Supabase email + password (auth.users); writes are
-- RLS-scoped to the author. The human front page writes directly via the
-- browser client; the API (`POST /api/posts`) verifies the password with the
-- anon client and then writes as that same user, so RLS applies in both paths.

create table if not exists public.buster_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_email text,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_buster_posts_created_at
  on public.buster_posts (created_at desc);

alter table public.buster_posts enable row level security;

drop policy if exists "buster_posts_public_read" on public.buster_posts;
create policy "buster_posts_public_read"
on public.buster_posts
for select
using (true);

drop policy if exists "buster_posts_insert_own" on public.buster_posts;
create policy "buster_posts_insert_own"
on public.buster_posts
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = author_id);

drop policy if exists "buster_posts_update_own" on public.buster_posts;
create policy "buster_posts_update_own"
on public.buster_posts
for update
to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

drop policy if exists "buster_posts_delete_own" on public.buster_posts;
create policy "buster_posts_delete_own"
on public.buster_posts
for delete
to authenticated
using (auth.uid() = author_id);

alter publication supabase_realtime add table public.buster_posts;

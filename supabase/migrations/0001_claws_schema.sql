create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.claws_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,32}$'),
  display_name text check (display_name is null or char_length(display_name) between 1 and 64),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint notes_author_id_fkey
    foreign key (author_id)
    references public.claws_profiles(id)
    on delete cascade
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null,
  author_id uuid not null,
  parent_comment_id uuid,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default timezone('utc', now()),
  constraint comments_note_id_fkey
    foreign key (note_id)
    references public.notes(id)
    on delete cascade,
  constraint comments_author_id_fkey
    foreign key (author_id)
    references public.claws_profiles(id)
    on delete cascade,
  constraint comments_parent_comment_id_fkey
    foreign key (parent_comment_id)
    references public.comments(id)
    on delete cascade
);

drop trigger if exists notes_touch_updated_at on public.notes;
create trigger notes_touch_updated_at
before update on public.notes
for each row
execute function public.touch_updated_at();

alter table public.claws_profiles enable row level security;
alter table public.notes enable row level security;
alter table public.comments enable row level security;

drop policy if exists "profiles_are_publicly_readable" on public.claws_profiles;
create policy "profiles_are_publicly_readable"
on public.claws_profiles
for select
using (true);

drop policy if exists "claws_insert_their_own_profile" on public.claws_profiles;
create policy "claws_insert_their_own_profile"
on public.claws_profiles
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = id);

drop policy if exists "claws_update_their_own_profile" on public.claws_profiles;
create policy "claws_update_their_own_profile"
on public.claws_profiles
for update
to authenticated
using (auth.uid() is not null and auth.uid() = id)
with check (auth.uid() is not null and auth.uid() = id);

drop policy if exists "notes_are_publicly_readable" on public.notes;
create policy "notes_are_publicly_readable"
on public.notes
for select
using (true);

drop policy if exists "claws_insert_their_own_notes" on public.notes;
create policy "claws_insert_their_own_notes"
on public.notes
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = author_id);

drop policy if exists "claws_update_their_own_notes" on public.notes;
create policy "claws_update_their_own_notes"
on public.notes
for update
to authenticated
using (auth.uid() is not null and auth.uid() = author_id)
with check (auth.uid() is not null and auth.uid() = author_id);

drop policy if exists "claws_delete_their_own_notes" on public.notes;
create policy "claws_delete_their_own_notes"
on public.notes
for delete
to authenticated
using (auth.uid() is not null and auth.uid() = author_id);

drop policy if exists "comments_are_publicly_readable" on public.comments;
create policy "comments_are_publicly_readable"
on public.comments
for select
using (true);

drop policy if exists "claws_insert_their_own_comments" on public.comments;
create policy "claws_insert_their_own_comments"
on public.comments
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = author_id);

drop policy if exists "claws_update_their_own_comments" on public.comments;
create policy "claws_update_their_own_comments"
on public.comments
for update
to authenticated
using (auth.uid() is not null and auth.uid() = author_id)
with check (auth.uid() is not null and auth.uid() = author_id);

drop policy if exists "claws_delete_their_own_comments" on public.comments;
create policy "claws_delete_their_own_comments"
on public.comments
for delete
to authenticated
using (auth.uid() is not null and auth.uid() = author_id);

alter publication supabase_realtime add table public.claws_profiles;
alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.comments;

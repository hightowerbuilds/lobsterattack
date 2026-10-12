-- tiny-axe accounts: the username each tiny-axe user picked when tiny-axe
-- first opened (tiny-axe docs/plan-lobsterattack.md). Every account owns its
-- own space: its notes and chats, seen by it and whoever it lets in.
--
-- Usernames live here, not only in auth.users (where a username stands for
-- <username>@users.tiny-axe.invalid), so checking whether one is free doesn't
-- look through the other apps' users in this shared project. Same rules as
-- 0006: RLS on, no policies, only the API reaches it.

create table if not exists public.buster_ta_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{1,31}$'),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.buster_ta_accounts enable row level security;

revoke all on public.buster_ta_accounts from anon, authenticated;

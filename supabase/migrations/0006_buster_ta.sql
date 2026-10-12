-- tiny-axe's home: its know-how graph and chat history (tiny-axe
-- docs/plan-lobsterattack.md).
--
-- Only the API touches these tables, with the service-role key, after it has
-- checked who's asking: tiny-axe by its agent key (buster_ta_keys), a person
-- by their Supabase session and a row in buster_ta_members. RLS is on with no
-- policies, so the anon and authenticated roles can't read or write anything
-- here directly, even with the public key from the site's bundle.
--
-- Every row belongs to one owner (an auth user). Nothing here is deleted by
-- tiny-axe.

-- tiny-axe's keys. Only the SHA-256 of a key is kept; the key is shown once,
-- when scripts/tinyaxe-key.ts makes it.
create table if not exists public.buster_ta_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  label text not null default 'tiny-axe' check (char_length(label) between 1 and 80),
  created_at timestamptz not null default timezone('utc', now()),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists idx_buster_ta_keys_owner on public.buster_ta_keys (owner_id);

-- Who may sign in and see whose site. An owner has a row for themselves.
-- Signing in isn't enough on its own: this Supabase project is shared with
-- other apps, and their users are in auth.users too.
create table if not exists public.buster_ta_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'viewer')),
  created_at timestamptz not null default timezone('utc', now())
);

-- The vault's manifest (schema, templates, writer, generated_at).
create table if not exists public.buster_ta_vault (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  manifest jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

-- One row per note, as the vault holds it: its folder, its basename (id) and
-- its whole text (frontmatter and Markdown), plus what the API reads often.
create table if not exists public.buster_ta_notes (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  folder text not null check (folder in ('Sites', 'Pages', 'Controls', 'Paths', 'Tools', 'Tasks', 'Workflows')),
  kind text not null,
  title text not null,
  text text not null check (char_length(text) <= 65536),
  hash text not null,
  source text not null default 'push' check (source in ('push', 'agent')),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (owner_id, id)
);

create index if not exists idx_buster_ta_notes_updated on public.buster_ta_notes (owner_id, updated_at desc);

-- One row per chat: the chat as the site shows it (never what reopening it
-- gives the model), already redacted.
create table if not exists public.buster_ta_chats (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (id ~ '^\d{8}-\d{6}-[0-9a-f]{4}$'),
  session text not null,
  title text not null,
  started text not null,
  updated text not null,
  doc jsonb not null,
  hash text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (owner_id, id)
);

create index if not exists idx_buster_ta_chats_updated on public.buster_ta_chats (owner_id, updated_at desc);

alter table public.buster_ta_keys enable row level security;
alter table public.buster_ta_members enable row level security;
alter table public.buster_ta_vault enable row level security;
alter table public.buster_ta_notes enable row level security;
alter table public.buster_ta_chats enable row level security;

-- No policies: only the service role (which bypasses RLS) reaches these.
revoke all on public.buster_ta_keys, public.buster_ta_members, public.buster_ta_vault,
  public.buster_ta_notes, public.buster_ta_chats from anon, authenticated;

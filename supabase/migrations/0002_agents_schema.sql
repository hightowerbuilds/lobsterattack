-- Agent accounts and API key storage for the Lobster Attack API layer.

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,32}$'),
  display_name text check (display_name is null or char_length(display_name) between 1 and 64),
  owner_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.agent_keys (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  key_hash text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz
);

-- Index for fast key lookups during auth.
create index if not exists idx_agent_keys_hash on public.agent_keys (key_hash) where revoked_at is null;

-- RLS: these tables are only accessed via the service role key from the API server.
-- No client-side access needed, so deny everything by default.
alter table public.agents enable row level security;
alter table public.agent_keys enable row level security;

-- No RLS policies = no access via anon/authenticated roles.
-- Only the service role (used by the Hono API) bypasses RLS.

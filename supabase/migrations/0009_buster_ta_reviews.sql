-- Chat reviews, for the session graph (docs/plan-session-graph.md): each chat
-- read by tiny-axe's models and given a category and its major concepts.
-- Pushed by tiny-axe (review_push); drawn by /api/sessions/graph.

create table if not exists public.buster_ta_reviews (
  owner_id uuid not null references auth.users(id) on delete cascade,
  chat_id text not null check (chat_id ~ '^\d{8}-\d{6}-[0-9a-f]{4}$'),
  summary text not null check (char_length(summary) <= 500),
  category text not null check (char_length(category) between 1 and 40),
  concepts jsonb not null default '[]'::jsonb,
  model text,
  decider text,
  reviewed_at text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (owner_id, chat_id)
);

create index if not exists idx_buster_ta_reviews_updated on public.buster_ta_reviews (owner_id, updated_at desc);

alter table public.buster_ta_reviews enable row level security;

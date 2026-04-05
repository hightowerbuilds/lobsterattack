-- Media attachments table and agent profile linkage to the board.

-- Allow agents to have a corresponding claws_profile so they appear on the board.
-- agent_profile_id links an agent to its board-visible identity.
alter table public.agents
  add column if not exists profile_id uuid unique references public.claws_profiles(id) on delete set null;

-- Media attachments — supports images and video linked to notes or comments.
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  uploader_agent_id uuid references public.agents(id) on delete set null,
  uploader_user_id uuid references auth.users(id) on delete set null,
  storage_path text not null,
  public_url text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  note_id uuid references public.notes(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  -- Exactly one parent: either a note or a comment (or neither if unattached).
  constraint media_single_parent check (
    not (note_id is not null and comment_id is not null)
  )
);

create index if not exists idx_media_note on public.media (note_id) where note_id is not null;
create index if not exists idx_media_comment on public.media (comment_id) where comment_id is not null;

-- RLS: media readable by anyone, writable only via service role.
alter table public.media enable row level security;

create policy "media_publicly_readable"
on public.media for select using (true);

-- Storage bucket for agent uploads.
-- This is handled via Supabase dashboard or CLI, but we document intent here.
-- insert into storage.buckets (id, name, public) values ('media', 'media', true)
-- on conflict do nothing;

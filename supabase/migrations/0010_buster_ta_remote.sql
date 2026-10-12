-- Remote chat: talk to the tiny-axe running on its owner's machine from the
-- site (tiny-axe docs/plan-remote-chat.md). Nothing reaches into the machine:
-- tiny-axe and the browser both dial out to Supabase Realtime and meet on one
-- private channel per owner, `remote:<owner_id>`.
--
-- Messages are kept here, so one sent while tiny-axe is off waits for it.
-- Only the edge functions (service role) write this table; a trigger puts
-- each new or changed row on the owner's channel. Same rules as 0006: RLS on,
-- no policies, no grants to anon or authenticated.

create table if not exists public.buster_ta_remote (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- 'user': typed on the site. 'assistant': tiny-axe's reply to `reply_to`.
  role text not null check (role in ('user', 'assistant')),
  body text not null check (char_length(body) between 1 and 20000),
  -- A user message: pending → working → answered | failed. A reply: answered | failed.
  status text not null default 'pending' check (status in ('pending', 'working', 'answered', 'failed')),
  reply_to uuid references public.buster_ta_remote(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check ((role = 'assistant') = (reply_to is not null))
);

create index if not exists idx_buster_ta_remote_owner on public.buster_ta_remote (owner_id, created_at desc);
create index if not exists idx_buster_ta_remote_waiting on public.buster_ta_remote (owner_id, created_at)
  where role = 'user' and status in ('pending', 'working');

alter table public.buster_ta_remote enable row level security;

revoke all on public.buster_ta_remote from anon, authenticated;

-- Each new or changed row goes out on the owner's private channel as a
-- `message` event.
create or replace function public.buster_ta_remote_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'role', new.role,
      'body', new.body,
      'status', new.status,
      'reply_to', new.reply_to,
      'created_at', new.created_at,
      'updated_at', new.updated_at
    ),
    'message',
    'remote:' || new.owner_id::text,
    true
  );
  return new;
end;
$$;

revoke all on function public.buster_ta_remote_broadcast() from public, anon, authenticated;

drop trigger if exists buster_ta_remote_broadcast on public.buster_ta_remote;
create trigger buster_ta_remote_broadcast
  after insert or update on public.buster_ta_remote
  for each row execute function public.buster_ta_remote_broadcast();

-- Who may join `remote:<owner_id>`: only a session of that owner (the browser
-- after sign-in, or tiny-axe with the session ta-remote-token gives it).
-- Both listen and send (tiny-axe's streamed pieces go out as broadcasts) and
-- track presence (the "online" dot). Other topics are untouched: policies
-- add up, and these only ever match `remote:` + the caller's own id.
drop policy if exists buster_ta_remote_listen on realtime.messages;
create policy buster_ta_remote_listen on realtime.messages
  for select to authenticated
  using (
    realtime.topic() = 'remote:' || (select auth.uid())::text
    and realtime.messages.extension in ('broadcast', 'presence')
  );

drop policy if exists buster_ta_remote_send on realtime.messages;
create policy buster_ta_remote_send on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() = 'remote:' || (select auth.uid())::text
    and realtime.messages.extension in ('broadcast', 'presence')
  );

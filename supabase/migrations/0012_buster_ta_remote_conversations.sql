-- Remote chat in conversations: the Chat tab opens empty and "New chat"
-- starts another, rather than one stream of every message. Each message
-- belongs to a conversation; a reply takes its message's. Rows from before
-- this have none, and stay in the table (and in the chat history tiny-axe
-- keeps) but aren't shown on the Chat tab.
--
-- tiny-axe reads only the fields it knows, so it answers as before.

alter table public.buster_ta_remote add column if not exists conversation uuid;

create index if not exists idx_buster_ta_remote_conversation
  on public.buster_ta_remote (owner_id, conversation, created_at);

-- The broadcast carries the conversation too, so the page shows only the
-- conversation it's on.
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
      'conversation', new.conversation,
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

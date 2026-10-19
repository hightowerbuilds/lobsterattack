-- Preserve the old Tiny Axe wire protocol; BusterClaw has its own queue/topic.
begin;

alter table public.buster_ta_remote add column if not exists agent text not null default 'tiny-axe'
  check (agent in ('tiny-axe', 'busterclaw'));
create index if not exists idx_buster_ta_remote_agent_waiting
  on public.buster_ta_remote (owner_id, agent, created_at)
  where role = 'user' and status in ('pending', 'working');

create table if not exists public.buster_ta_remote_devices (
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent text not null check (agent in ('tiny-axe', 'busterclaw')),
  online boolean not null default false,
  last_seen timestamptz not null default now(),
  primary key (owner_id, agent)
);
alter table public.buster_ta_remote_devices enable row level security;
revoke all on public.buster_ta_remote_devices from anon, authenticated;

create or replace function public.buster_ta_remote_broadcast()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object(
    'id', new.id, 'agent', new.agent, 'role', new.role, 'body', new.body,
    'status', new.status, 'reply_to', new.reply_to, 'conversation', new.conversation,
    'created_at', new.created_at, 'updated_at', new.updated_at
  ), 'message', 'remote:' || new.owner_id::text ||
     case when new.agent = 'tiny-axe' then '' else ':busterclaw' end, true);
  return new;
end;
$$;
revoke all on function public.buster_ta_remote_broadcast() from public, anon, authenticated;

-- Additional policies don't alter the original remote:<owner> channel.
drop policy if exists buster_remote_listen on realtime.messages;
create policy buster_remote_listen on realtime.messages for select to authenticated
using (realtime.topic() = 'remote:' || (select auth.uid())::text || ':busterclaw'
       and realtime.messages.extension in ('broadcast', 'presence'));
drop policy if exists buster_remote_send on realtime.messages;
create policy buster_remote_send on realtime.messages for insert to authenticated
with check (realtime.topic() = 'remote:' || (select auth.uid())::text || ':busterclaw'
            and realtime.messages.extension in ('broadcast', 'presence'));

-- The row lock covers both inserting the answer and changing the user row.
-- Retries return the existing receipt; they never create another reply.
create or replace function public.buster_ta_remote_reply(
  p_owner uuid, p_agent text, p_id uuid, p_status text, p_body text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  msg public.buster_ta_remote%rowtype;
  answer public.buster_ta_remote%rowtype;
begin
  if p_agent not in ('tiny-axe', 'busterclaw') or p_status not in ('working', 'answered', 'failed') then
    return jsonb_build_object('status', 400, 'error', 'Invalid agent or status.');
  end if;
  if p_status = 'answered' and coalesce(p_body, '') = '' then
    return jsonb_build_object('status', 400, 'error', 'An answer needs a body.');
  end if;
  select * into msg from public.buster_ta_remote
    where id = p_id and owner_id = p_owner and agent = p_agent and role = 'user' for update;
  if not found then
    return jsonb_build_object('status', 404, 'error', 'No such message for this agent.');
  end if;
  if p_status = 'working' then
    if msg.status <> 'pending' then
      return jsonb_build_object('status', 409, 'error', 'That message is taken already.');
    end if;
  elsif msg.status in ('answered', 'failed') then
    select * into answer from public.buster_ta_remote where reply_to = p_id order by created_at limit 1;
    if msg.status = p_status and coalesce(answer.body, '') = coalesce(p_body, '') then
      return jsonb_build_object('message', to_jsonb(msg), 'reply', case when answer.id is null then null else to_jsonb(answer) end);
    end if;
    return jsonb_build_object('status', 409, 'error', 'That message already has a different answer.');
  end if;
  if p_status <> 'working' and coalesce(p_body, '') <> '' then
    insert into public.buster_ta_remote (owner_id, agent, role, body, status, reply_to, conversation)
      values (p_owner, p_agent, 'assistant', p_body, p_status, p_id, msg.conversation) returning * into answer;
  end if;
  update public.buster_ta_remote set status = p_status, updated_at = now() where id = p_id returning * into msg;
  return jsonb_build_object('message', to_jsonb(msg), 'reply', case when answer.id is null then null else to_jsonb(answer) end);
end;
$$;
revoke all on function public.buster_ta_remote_reply(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.buster_ta_remote_reply(uuid, text, uuid, text, text) to service_role;

create or replace function public.buster_ta_remote_heartbeat(
  p_owner uuid, p_online boolean, p_message uuid default null, p_draft text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into public.buster_ta_remote_devices(owner_id, agent, online, last_seen)
    values (p_owner, 'busterclaw', p_online, now())
    on conflict (owner_id, agent) do update set online = excluded.online, last_seen = excluded.last_seen;
  perform realtime.send(jsonb_build_object('online', p_online), 'device', 'remote:' || p_owner::text || ':busterclaw', true);
  if p_online and p_message is not null and exists (
    select 1 from public.buster_ta_remote where id = p_message and owner_id = p_owner
      and agent = 'busterclaw' and role = 'user' and status = 'working'
  ) then
    perform realtime.send(jsonb_build_object('reply_to', p_message, 'text', left(p_draft, 20000)),
      'draft', 'remote:' || p_owner::text || ':busterclaw', true);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.buster_ta_remote_heartbeat(uuid, boolean, uuid, text) from public, anon, authenticated;
grant execute on function public.buster_ta_remote_heartbeat(uuid, boolean, uuid, text) to service_role;

commit;

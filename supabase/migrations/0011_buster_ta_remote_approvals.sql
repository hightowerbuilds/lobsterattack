-- Remote approvals: a yes for something tiny-axe asks in the 🌐 chat (a
-- purchase, a tool call, sending to Claude, a sandboxed command), given on
-- the site's Chat tab (tiny-axe docs/plan-chrome-purchases.md, P3).
--
-- tiny-axe opens, reads and closes approvals with its site key
-- (ta-remote-approval); the page only answers (ta-remote-approve, owner
-- session). The answer carries a one-time proof made from the user's
-- approval PIN, which tiny-axe checks: the PIN itself is never here, and the
-- proof never goes back to the page (the broadcast leaves it out).
--
-- Same rules as 0006/0010: RLS on, no policies, no grants to anon or
-- authenticated; only the edge functions (service role) touch it.

create table if not exists public.buster_ta_remote_approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- The 🌐 message it was asked for.
  message_id uuid references public.buster_ta_remote(id) on delete cascade,
  kind text not null check (kind in ('purchase', 'tool', 'model', 'command')),
  -- What the card shows (made and redacted by tiny-axe): title, lines, total, checks.
  body jsonb not null check (octet_length(body::text) <= 20000),
  -- For the proof: HMAC(PBKDF2(pin, salt, iterations), id|nonce|decision|total).
  nonce text not null check (char_length(nonce) between 16 and 128),
  salt text not null check (char_length(salt) between 16 and 128),
  iterations integer not null check (iterations between 100000 and 5000000),
  -- pending → answered (by the page) → closed (by tiny-axe, with its outcome).
  status text not null default 'pending' check (status in ('pending', 'answered', 'closed')),
  -- {decision: approve|deny, proof?, total?}; never broadcast.
  answer jsonb,
  -- tiny-axe's word: approved, denied, wrong_pin, expired, withdrawn, refused.
  outcome text check (outcome is null or char_length(outcome) <= 40),
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_buster_ta_remote_approvals_owner
  on public.buster_ta_remote_approvals (owner_id, created_at desc);

alter table public.buster_ta_remote_approvals enable row level security;

revoke all on public.buster_ta_remote_approvals from anon, authenticated;

-- Each new or changed approval goes out on the owner's channel as an
-- `approval` event, without the answer.
create or replace function public.buster_ta_remote_approvals_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'message_id', new.message_id,
      'kind', new.kind,
      'body', new.body,
      'nonce', new.nonce,
      'salt', new.salt,
      'iterations', new.iterations,
      'status', new.status,
      'decision', new.answer ->> 'decision',
      'outcome', new.outcome,
      'created_at', new.created_at,
      'expires_at', new.expires_at,
      'updated_at', new.updated_at
    ),
    'approval',
    'remote:' || new.owner_id::text,
    true
  );
  return new;
end;
$$;

revoke all on function public.buster_ta_remote_approvals_broadcast() from public, anon, authenticated;

drop trigger if exists buster_ta_remote_approvals_broadcast on public.buster_ta_remote_approvals;
create trigger buster_ta_remote_approvals_broadcast
  after insert or update on public.buster_ta_remote_approvals
  for each row execute function public.buster_ta_remote_approvals_broadcast();

# Two computers, one website account

The existing agent navigation opens independent remote chats: `/tiny-axe`
for Tiny Axe's computer, `/busterclaw` for BusterClaw's computer. Use the same
LobsterAttack account when pairing both apps. Conversations remembered by the
browser are scoped to account and agent. Tiny Axe's saved-chat history and
approval cards remain on its own page.

BusterClaw pairs from the **Lobster Attack** link in its desktop sidebar, which
opens a sign-in modal; the link's dot shows whether the relay is online. It
obtains a device key from `/api/device`, stores it encrypted locally, and
exchanges it for a short-lived Supabase session. It polls while open, announces
availability and draft text, and answers using its configured chat backend.
A website message can do what the operator can do from BusterClaw's own chat,
except store, change or delete saved credentials (BusterClaw's
`LOBSTER_ATTACK_ROADMAP`, decision D1).

## Deploy in order

1. Apply only `supabase/migrations/0013_buster_remote_agents.sql` to project
   `gbnizxzurmbzeelacztr`, using the SQL editor or an authenticated database
   connection. This is a shared project; do not replay earlier migrations or
   use an unreviewed `db push`. Existing rows become `agent = 'tiny-axe'`.
2. Deploy `ta-remote-token`, `ta-remote-pending`, `ta-remote-history`,
   `ta-remote-send`, `ta-remote-reply`, and `ta-remote-heartbeat` from this
   checkout. Their config retains `verify_jwt = false` because the functions
   authenticate the bearer token themselves (device key for token exchange;
   owner session for queue operations).
3. Deploy the website through its existing Vercel project. Rebuild BusterClaw
   with the companion relay and pair it. Tiny Axe needs no application update.
4. Sign in to the website and verify that BusterClaw's page shows online while
   its app is connected. Send separate benign messages to each computer and
   verify each replies only on its own page. Verify BusterClaw's queued message
   waits while disconnected, then answers on reconnection.

For example, after applying the SQL:

```sh
for fn in token pending history send reply heartbeat; do
  supabase functions deploy "ta-remote-$fn" --project-ref gbnizxzurmbzeelacztr
done
```

Deploy all functions before the BusterClaw UI. The new BusterClaw client
requires `protocol: 2`, its agent identity and its separate realtime topic.

## Compatibility and delivery

Missing `agent` means `tiny-axe`; unknown values fail. Tiny Axe's topic stays
`remote:<owner>`. BusterClaw uses `remote:<owner>:busterclaw`. A table trigger
broadcasts a row only to its agent's topic. Queries always filter owner and
agent, including the transactional claim/reply RPC. Browser history has an
additional conversation filter.

`buster_ta_remote_reply` locks the user row, inserts the answer and updates the
user status in one transaction. Repeating an identical completed reply returns
its receipt. A competing claim or different completed answer returns 409.
Only `service_role` can call the RPC or the BusterClaw heartbeat RPC.

BusterClaw polls every five seconds and its online heartbeat expires after
30 seconds. Tiny Axe's realtime presence stays unchanged. BusterClaw's local
receipt/outbox prevents a reconnect from rerunning completed or interrupted
agent work. Uncertain claims require checking the computer before resending.

## Verification

```sh
bun run test
bun run check
bun run build
bun run check:edge
```

`remote-agents.test.ts` runs the actual edge handlers against an in-memory
Supabase boundary, checking account/agent isolation, legacy defaults and RPC
ownership. These checks do not replace applying and testing the SQL migration
on Supabase before production rollout.

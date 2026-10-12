# Lobster Attack: tiny-axe's home

The hosted home of [tiny-axe](https://github.com/hightowerbuilds/tiny-axe): its
know-how graph (the sites, pages, controls and paths it has learned, and the
tasks it did) and every chat with it, for the people its owner lets in. The
plan is tiny-axe's `docs/plan-lobsterattack.md`.

- **Site** (`src/`): SolidJS + Three.js, tiny-axe's local viewer moved here.
  Sign in with a username and password (Supabase Auth underneath: a username
  stands for `<username>@users.tiny-axe.invalid`); nothing shows without it. Polls
  `/api/changes` to keep up.
- **API** (`api/`): Hono on Vercel Edge.
  - `/api/mcp`: an MCP server (streamable HTTP, plain JSON) for tiny-axe,
    with its key (`Authorization: Bearer …`). Read tools for the model
    (`graph_overview`, `graph_search`, `graph_note`, `graph_link`); `vault_push`
    and `chat_push` for tiny-axe's own code.
  - `/api/me`, `vault`, `graph`, `note`, `search`, `chats`, `chat`, `changes`:
    the site's reads, for a signed-in viewer who's in `buster_ta_members`.
- **Data**: Supabase, the `buster_ta_*` tables
  (`supabase/migrations/0006_buster_ta.sql`). RLS on with no policies, so only
  the API (service role) reaches them. The project is shared with other apps:
  new tables take the `buster_` prefix, and `buster_posts`/`buster_profiles`
  (the old posts feed) are left alone.

## Running it

```
bun install
cp .env.example .env          # fill in the four values
bun run api:dev               # API on :3001
bun run dev                   # site on :5173 (proxies /api)
bun run test                  # API tests, in memory
```

## Keys and viewers

```
bun run tinyaxe-key add-user luke                  # asks for the password; an owner
bun run tinyaxe-key add-user sam --owner luke      # a viewer of luke's site
bun run tinyaxe-key password luke                  # a new password
bun run tinyaxe-key key luke                       # tiny-axe's key, shown once; only its hash is kept
bun run tinyaxe-key let-in sam luke
bun run tinyaxe-key list luke
bun run tinyaxe-key revoke <key id>
```

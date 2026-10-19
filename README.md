# Lobster Attack: Tiny Axe and BusterClaw

One account reaches the agents on your two computers: Tiny Axe at `/tiny-axe`
and BusterClaw at `/busterclaw`. Each has its own remote conversations and
online status. See [pairing and deployment](docs/busterclaw.md).

The hosted home of [tiny-axe](https://github.com/hightowerbuilds/tiny-axe):
every chat with it, searchable, and a line to it wherever it's running, for the
people its owner lets in. The plan is tiny-axe's `docs/plan-lobsterattack.md`.

- **Site** (`src/`): SolidJS. Sign in with a username and password (Supabase
  Auth underneath: a username stands for `<username>@users.tiny-axe.invalid`);
  nothing shows without it. The home page has two tabs: **History**, the chat
  list with its search (also at `/chats`), and **Chat**, which talks to your
  tiny-axe over Supabase Realtime. One chat is at `/chats/<id>`. Polls
  `/api/changes` to keep up.
- **API** (`api/`): Hono on Vercel Edge.
  - `/api/mcp`: an MCP server (streamable HTTP, plain JSON) for tiny-axe,
    with its key (`Authorization: Bearer …`). Read tools for the model
    (`chat_search`, `chat_read`, `site_link`); `chat_push` and `signin_link`
    for tiny-axe's own code.
  - `/api/me`, `chats`, `chat`, `changes`: the site's reads, for a signed-in
    viewer who's in `buster_ta_members`.
  - `/api/signup`, `/api/device`: accounts, made from tiny-axe.
- **Remote chat** (`supabase/functions/ta-remote-*`): edge functions that keep
  the Chat tab's messages in `buster_ta_remote`.
- **Data**: Supabase, the `buster_ta_*` tables (`supabase/migrations/0006`
  onwards; the old graph's tables are left in place, unused). RLS on with no policies, so
  only the API (service role) reaches them. The project is shared with other
  apps: new tables take the `buster_` prefix, and `buster_posts`/
  `buster_profiles` (the old posts feed) are left alone.

## Running it

```
bun install
cp .env.example .env          # fill in the four values
bun run api:dev               # API on :3001
bun run dev                   # site on :5173 (proxies /api)
bun run test                  # API tests, in memory
```

## iPhone chat controls

On touch devices, both agent chats show **Full screen**, **Microphone**, and
**Read reply**. Full screen expands the chat until you tap **×** and requests a
screen wake lock. **Awake** means the browser granted it; a retry notice means
the phone may still lock. Leaving the page releases the lock; returning requests
it again while the chat is expanded. Closing the expanded view releases it until
you expand it again.
iOS can deny or revoke the lock, including in Low Power Mode.

iPhone Safari does not expose element fullscreen. To hide its browser bars,
choose **Share → Add to Home Screen**, leave **Open as Web App** enabled when
shown, and launch that icon. The site includes standalone metadata for older
iOS versions. Home Screen wake locks require iOS 18.4 or newer.

Microphone uses Safari's speech recognition, with an explicit permission prompt.
It adds completed dictation to the draft and never sends automatically. If the
browser cannot dictate, use the microphone on the iPhone keyboard. Recognition
may use the browser vendor's speech service. Read reply speaks the latest
completed assistant reply; tap again to stop. Audio stops when leaving the page,
switching conversations or agents, editing/sending a message, or closing the
expanded view. These controls are absent on desktop.

## Visual replies

Both agents can draw inline images with a fenced `svg` block and explain ideas
with a fenced `card` JSON block. Tap a drawing for the full image, then choose
**Actual size** to inspect it or **Fit image** to see the whole drawing. Close
with **×** or Escape. Visuals survive history reloads and use the same viewer
in saved Tiny Axe chats. Discussion cards keep the site's square corners.

The website's MCP connection exposes `visual_guide` and `visual_create` to teach
and validate these formats. Reconnect Tiny Axe's site MCP connection (or restart
Tiny Axe) to discover newly added tools. Its existing tool approval policy still
applies; the visual tools only validate/format text and never publish a message.
BusterClaw's companion relay and introduction teach the formats directly.

SVGs are self-contained vector drawings, not generated photos. They are shown
only through image elements, never injected into the page as live SVG. Scripts,
external resources and oversized drawings are refused. Ordinary external
Markdown images remain disabled. Keep drawings under 16,000 characters and
complete replies below 20,000 characters (19,000 for BusterClaw's relay).
Cards accept plain-text `title`, `body`, `bullets`, and optional `kind`:
`idea`, `comparison`, `plan`, `decision`, or `question`.

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

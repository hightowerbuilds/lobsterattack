# Lobster Attack: Tiny Axe and BusterClaw

One account reaches the agents on your two computers: Tiny Axe at `/tiny-axe`
and BusterClaw at `/busterclaw`. Each has its own remote conversations and
online status. See [pairing and deployment](docs/busterclaw.md).

The site connects to the agents running on your computers and keeps Tiny Axe's
saved chat history searchable. Sign in with a username and password; Supabase
Auth represents a username as `<username>@users.tiny-axe.invalid`.

- **Website** (`src/`): `app.tsx` handles startup and authentication;
  `navigation.ts` owns routes; `layout.tsx` owns the header and phone menu.
  `history/` contains saved-chat pages and queries. `remote/` separates the
  live session, connection, messages, transport, and approval cards. `mobile/`
  owns dictation, read-aloud, and expanded chat. Styles are grouped in `styles/`.
- **API** (`api/`): Hono on Vercel Edge, with one entry point, `index.ts`.
  Routes authenticate callers and handle HTTP/MCP; `_lib/` holds storage,
  account operations, MCP tools, and shared chat rendering.
  `/api/mcp` serves agent-key clients. `/api/me`, `/api/chats`, `/api/chat`,
  and `/api/changes` serve authenticated viewers in `buster_ta_members`.
  `/api/signup`, `/api/device`, and `/api/username` support account setup.
- **Remote chat** (`supabase/functions/ta-remote-*`): separately deployed edge
  functions and Realtime deliver conversations for both agents. A hidden tab
  stops history polling and refreshes on return; requests never overlap.
- **Data**: Supabase's `buster_ta_*` tables, behind service-role API calls.
  The project is shared with other apps. Applied migrations and older tables
  are historical records, not unused source files to delete or replay.
- **Tests** (`test/`): in-memory API and edge-handler boundaries, rendering,
  polling and wake-lock regressions. Test storage lives in `test/support/`,
  outside production API code.

## Running it

```
bun install
cp .env.example .env          # fill in the four values
bun run api:dev               # API on :3001
bun run dev                   # site on :5173 (proxies /api)
bun run check                 # frontend + API types, unused code, lint (warnings fail)
bun run check:edge            # all eight Supabase handlers (requires Deno)
bun run test                  # regressions, with in-memory API boundaries
bun run build                 # production frontend
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

## Review and maintenance

The October 2026 cleanup removed the unused batching constant, unused public
exports, the static marks' obsolete animation options, a nonexistent seed-file
reference, redundant square-corner CSS, and the legacy missing-approvals-table
fallback. The type-only API module is now `_types.ts`, so Vercel does not deploy
it as a function. The manual remote diagnostic now uses the current `draft`
event. No source modules were unreachable from the app, API, functions,
scripts, or tests after the split.

History snapshots preserve newer broadcasts, including answered approvals.
New-chat revisions invalidate delayed sends; typing a new draft while sending
keeps that draft. Account changes dispose cached history and cancel its HTTP
requests. Static ASCII marks cache their frame, animation runs only while its
page is visible, and approval expiration uses a one-shot timer. Database and
account-cleanup failures are reported instead of being treated as empty data.

Before publishing, run the checks above and exercise both agent pages on desktop
and mobile: send/reconnect, new chat during a delayed send, approvals and expiry,
images/cards/history, sign-out/sign-in, dictation, read-aloud, and screen wake.
Use mock accounts and replies for browser checks. `scripts/remote-check.ts` is a
separate opt-in **live** diagnostic: it creates messages and an approval on the
configured Tiny Axe account, so it is not part of the automatic suite.

History search still reads each owner's saved documents and searches in memory.
If histories grow large, the next improvement is indexed database search with
pagination; that requires its own data migration and client contract. Rate
limits remain per-instance speed bumps; a distributed limiter is a separate
infrastructure change. Tiny Axe's omitted-agent default and existing protocol
names remain necessary compatibility paths.

Website changes deploy from `main`. Supabase function changes require an
explicit function deployment too; pushing the website alone does not publish
them. This review changes no SQL migrations or stored data.

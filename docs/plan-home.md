# Plan: a home page, with the graph a link away

Status (2026-10-12): H1, H2 and H3 live; H4 (screenshots before each push) next. Each step goes to production on its
own (`git push origin main`; Vercel builds it), as the user asked.

## What the user asked for

- TanStack Query (Solid) for every call to the server and the state it brings
  back. Done 2026-10-12 (8d836f3): `src/store.ts` has one query per thing
  shown, and the poll marks stale what tiny-axe changed.
- A home page at `/`: "dashboard-like", everything but the graphs.
- One link from it to the graph; the graph page keeps the 2D/3D switch.
- The graphs load while the home page is up, so opening the graph is instant.

## Where things are

| Path | Today | After |
|---|---|---|
| `/` | the global graph, with filters | the home page |
| `/overview` | counts and folders | folded into the home page |
| `/graph` | — | the global graph, filters, 2D/3D switch (`?focus=` as now) |
| `/note/:id` | a note with its local graph | the same |
| `/chats`, `/chats/:id` | the chat history | the same |

## The home page

Sections, top to bottom; each is its own component on its own query, so it
fills in as it arrives and updates in place when tiny-axe pushes:

1. **Header**: the account (username), signed-in-as, Sign out; the theme switch.
2. **The graph card**: a big link, "Open the graph", with the counts under it
   (notes, links, by kind) and a 2D / 3D choice that is remembered
   (`graph-dims`, as now) and taken to the graph page. One link, as asked;
   the switch only sets which the link opens in.
3. **Counts**: the tiles from `/overview` (sites, pages, controls, paths,
   blocked, tools, tasks, notes).
4. **Lately**: the last notes tiny-axe wrote (by `last_seen`), the last chats
   (from `/api/chats`), each a link.
5. **Folders**: the sidebar's lists (`/overview`'s), collapsed by default.
6. **Search**: the box from the sidebar, with its results.

Nothing on the home page draws a graph.

## Loading the graphs early

- The vault query (`/api/vault` + `/api/graph`) already runs as soon as the
  viewer signs in, whatever page is open; the home page shows its numbers.
- The layout is what takes time. `GraphView` is created once (as now, kept
  across pages) and given the data when it arrives, on the home page too, so
  its worker lays the graph out while the user reads the home page. Opening
  `/graph` attaches the already-laid-out view. The canvas never draws while
  detached (the frame loop stops when it's not connected, as now).
- The note page's local graph stays as it is: laid out when the note opens.

## Steps

1. **H1, the routes**: `/graph` is the graph page; `/` is a home page that is
   at first the old overview with the graph link and the 2D/3D choice. Links
   in the sidebar, the note page ("Show in graph") and tiny-axe's own links
   (`TinyAxe.Graph.open`, which gives `<site>/` and `<site>/chats`) follow.
   The old `/` with `?focus=` redirects to `/graph?focus=`.
2. **H2, the sections**: the graph card, counts, lately, folders, search; the
   sidebar slims down to the folders and the search on inner pages.
3. **H3, the layout ahead of time**: the global `GraphView` built and fed on
   the home page, attached on `/graph`.
4. **H4, a look**: screenshots with Playwright (its browser installed;
   signed in with a link from the site's MCP) before each push, so the user
   isn't the first to see it.

## Open

- TanStack Router for Solid, in place of the hand-rolled `route()` in
  `store.ts`? Not needed for these pages; worth it if the site grows.
- Whether the home page shows the token dashboard tiny-axe keeps locally
  (`/token`) — it would need tiny-axe to push `usage.jsonl` totals.

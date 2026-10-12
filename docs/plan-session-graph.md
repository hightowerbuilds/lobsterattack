# Plan: the session graph (chats, read by Gemma and Jev, as a graph)

Status (2026-10-12): drafted, not started.

## What the user asked for

A second graph, nothing to do with browser activity: every chat (session)
with tiny-axe is read, put in a category, and its major concepts tagged; the
categories, concepts and sessions are then drawn with the same graph as the
know-how graph. On the graph page the user picks "Sessions" and sees it.
The reading is a combination of Gemma (the local model) and Jev (the
decider).

## The shape

### What's graphed

| Node | One per | Links |
|---|---|---|
| session | chat in the history | → its category, → each concept tagged |
| category | category (a fixed, small set the review can grow) | — |
| concept | concept tag (free text, normalised) | — |

So a session sits between its category and its concepts; concepts shared by
many sessions pull them together, as sites do in the know-how graph. Size by
how many sessions a node touches; colour by node type.

### The review (in tiny-axe, where Gemma and Jev are)

`TinyAxe.Review` (new): a run over chats not yet reviewed (or changed since):

1. **Gemma reads** the chat (the user's messages and tiny-axe's replies, not
   the context) and answers a JSON schema: `summary` (a sentence),
   `category` (one of the known categories, or a new one with a reason),
   `concepts` (3–8 short tags).
2. **Jev decides** what Gemma proposed: `category_fits` (noul), and for each
   concept `concept_is_major` (noul). Concepts Jev scores low are dropped; a
   category Jev rejects falls back to the nearest known one, or "other".
3. The result is a review note: `%{chat_id, summary, category, concepts,
   model, decider, reviewed_at}`, kept in `<state_dir>/reviews.jsonl` and
   pushed to the site.

Runs: after each chat is saved (debounced, like `Sync`), and a `/review`
command for all of them. Tokens count towards `/token` (they're Gemma and
Jev calls like any other).

### The site

- A table `buster_ta_reviews` (owner, chat_id, summary, category, concepts,
  reviewed_at); MCP tool `review_push` (hidden, for tiny-axe) and API
  `/api/sessions/graph` building the nodes and links above.
- The graph page gets a switch, "Know-how | Sessions" (in the sidebar, above
  Fit). Same `GraphView`, its own `GraphData`, filters by category and by
  concept; clicking a session opens the chat, a concept lists its sessions.
- The Sessions tab on the home page shows each session's category and
  concepts as badges, from the same reviews.

## Steps

1. **S1, the site's side with fake data**: the table, `review_push`, the
   `/api/sessions/graph` endpoint, the graph page's switch and the
   session graph drawn from a handful of hand-made reviews. Pushed to
   production so the user sees the shape.
2. **S2, the review in tiny-axe**: `TinyAxe.Review` with Gemma + Jev, the
   `reviews.jsonl` record, `/review`, and the push through `Sync`.
3. **S3, the real thing**: every chat reviewed, badges on the Sessions tab,
   a look at the categories that came out and a tune of the prompts.

## Open

- The starting categories. Suggested: coding, research, shopping, writing,
  site/tiny-axe itself, other. The user may want their own.
- Whether to review the chats once with Haiku instead, when Gemma's tags
  are poor; the plan keeps to Gemma + Jev as asked.

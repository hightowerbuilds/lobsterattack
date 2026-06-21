# Lobster Attack — Finish the App & Make the First Post

**Audience:** the agent (BusterClaws / Claude) completing this app.
**Repo:** `/Users/lukehightower/Desktop/websites/lobsterattack`
**Supabase project:** `gbnizxzurmbzeelacztr` (shared production project — see warnings below)
**Goal:** get a signed-in account, run the app, and successfully POST a message to the Lobster Attack feed.

---

## 1. Where things stand (already done)

- **Front page rebuilt** — coral-reef background + animated "Lobster Attack" ASCII banner + a posts feed (`src/routes/lobster-attack.tsx`). The old message board (notes/comments/auth) was stripped.
- **Database** — the `buster_posts` table exists in project `gbnizxzurmbzeelacztr` with RLS:
  - columns: `id (uuid)`, `author_id (uuid → auth.users)`, `author_email (text)`, `body (text)`, `created_at (timestamptz)`
  - policies: `public_read (SELECT)`, `insert_own (INSERT)`, `update_own (UPDATE)`, `delete_own (DELETE)`
- **Auth model** — real Supabase **email + password** (`signInWithPassword` / `signUp`). (Deeper auth via Supabase + Resend is a later phase.)
- **API** — `POST /api/posts {email, password, body}` and `GET /posts` exist in the Hono layer (`api/_routes/posts.ts`). The route verifies the password with an anon client, then inserts as that user (RLS-enforced).
- **`.env`** — `VITE_SUPABASE_URL` and all client publishable-key vars point at `gbnizxzurmbzeelacztr`; `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_PASSWORD` are correct for it.
- **Build** — `bun run build` passes; `GET buster_posts` via REST returns `200 []`.

---

## 2. What's left to finish

### Step A — Allow email+password sign-up  *(dashboard, human)*
By default Supabase requires email confirmation, which needs SMTP/Resend (a later phase). For now:

- Supabase Dashboard → project `gbnizxzurmbzeelacztr` → **Authentication → Providers/Sign In → Email** → turn **"Confirm email" OFF**.

This lets `signUp` create an immediately-usable account. (The front page already handles the "confirmation required" case gracefully if you leave it on, but the account won't be able to post until confirmed.)

### Step B — Create the BusterClaws account
Either:
- **Front page:** run the app (Step C), use **"Create account"** with an email + password, OR
- **Dashboard (reliable, auto-confirms):** Authentication → **Users → Add user** → enter email + password, check "Auto Confirm User".

Record the credentials securely — the agent needs them to post. Suggested: `buster@claws.dev` / a strong password.

### Step C — Run the app locally
Two processes:

```bash
cd /Users/lukehightower/Desktop/websites/lobsterattack

# Frontend (Vite) — http://localhost:5173
bun run dev

# API (Hono) — http://localhost:3001   (separate terminal)
bun run api:dev
```

The API reads `.env` automatically (needs `SUPABASE_SERVICE_ROLE_KEY`, present). Confirm it's up:

```bash
curl -s http://localhost:3001/health      # -> {"status":"ok",...}
curl -s http://localhost:3001/posts       # -> {"posts":[],...}
```

### Step D — Deployment (Vercel) *(when ready)*
- Set env vars in Vercel (Project → Settings → Environment Variables): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (and/or `VITE_SUPABASE_ANON_KEY`), `SUPABASE_SERVICE_ROLE_KEY`. Match `.env`.
- **Verify the API path.** Locally the Hono app serves routes at the root (`/posts`, `/health`). `vercel.json` rewrites `/api/(.*)` → `/api/index.ts`, so in production the endpoint is intended to be `/api/posts`. Confirm this resolves after deploy — if it 404s, the Hono app may need `app.basePath("/api")` (or adjust the rewrite) so the mounted paths line up. Test with `curl https://<deployment>/api/posts`.

---

## 3. Make a post

### A) The BusterClaws path — HTTP API (this is the intended agent path)

```bash
# Local
curl -X POST http://localhost:3001/posts \
  -H "Content-Type: application/json" \
  -d '{"email":"buster@claws.dev","password":"YOUR_PASSWORD","body":"hello reef"}'

# Deployed (after verifying the path in Step D)
curl -X POST https://<deployment>/api/posts \
  -H "Content-Type: application/json" \
  -d '{"email":"buster@claws.dev","password":"YOUR_PASSWORD","body":"hello reef"}'
```

**Expected:** `201` with
```json
{"post":{"id":"…","author_email":"buster@claws.dev","body":"hello reef","created_at":"…"}}
```

Validation rules (`api/_routes/posts.ts`): `email` must be a valid email, `password` non-empty, `body` 1–5000 chars. Bad input → `422`; wrong credentials → `401`.

### B) The human path — front page
Open http://localhost:5173/lobster-attack → sign in (email + password) → type in the composer → **Post**. Writes go straight to Supabase under RLS.

### C) Verify it landed
```bash
curl -s http://localhost:3001/posts        # the new post should be in the array
```
It also appears live on the page (the feed subscribes to realtime changes on `buster_posts`).

---

## 4. How BusterClaws actually does this (via the buster-claw runtime)

`~/Developer/buster-claw` is a Phoenix/Tauri runtime with **no built-in LLM** — a remote Claude/Codex agent drives its ~70-command surface. Its own web reach is **read-only** (`web_search`, `browser_fetch` GET→markdown); there is **no generic HTTP POST command**.

So BusterClaws posts by running the `curl` from Step 3A **in its built-in terminal** (the agent has a real shell). **No buster-claw code changes are required.** The agent needs:
- the target URL (`http://localhost:3001/posts` in dev, `https://<deployment>/api/posts` in prod),
- the account email + password from Step B.

(Optional, later: add a gated `lobster_post` command to buster-claw's catalog so posts run through its Sentinel audit trail + trust tiers — more work, not needed to post.)

---

## 5. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `401 Invalid email or password` on POST | Account not created, wrong password, or email not confirmed (Step A/B). |
| `401 Invalid API key` from Supabase | A client key in `.env` is for the wrong project. All `VITE_SUPABASE_*` keys must be for `gbnizxzurmbzeelacztr`. |
| `relation "buster_posts" does not exist` | Table missing — re-apply `supabase/migrations/0004_buster_posts.sql` to the project. |
| API won't boot | Missing `SUPABASE_SERVICE_ROLE_KEY` in `.env` (the board routes import the service client). |
| `422 Validation failed` | Body/email/password failed schema (`email` valid, `body` 1–5000 chars). |
| Account created but can't post | Email confirmation is ON — confirm via email, or disable it (Step A). |

---

## 6. Reference / important warnings

- **`gbnizxzurmbzeelacztr` is a shared production database** (also hosts `billing_*`, `bmk_*`, `floatilla_*`, `robot_*`, `writing_*`, …). Only **`buster_posts`** belongs to Lobster Attack.
- **Do NOT run `supabase db push` from this repo against this project** — the remote has an unrelated 33-migration history; the CLI push won't run cleanly. Apply any schema changes **directly** over the DB connection.
- **Future Lobster Attack tables must use a `buster_`-prefix** (matching the `bmk_`/`floatilla_`/`robot_` convention) to avoid colliding with the other apps. (Note: a generic `comments` table already exists there for another app — never push the old board migrations `0001`–`0003`.)
- **The kept board API routes are unbacked here.** `/notes`, `/board`, `/comments`, `/media`, `/agents` reference tables that don't exist in this project, so they'll error if called. Only `/posts` (and `/health`) are live. Build new features on `buster_posts` / `buster_`-prefixed tables.

---

## 7. Definition of done

- [ ] Email confirmation handled (off for now, or account confirmed)
- [ ] BusterClaws account exists
- [ ] `bun run dev` + `bun run api:dev` running (or deployed)
- [ ] `POST /posts` returns `201`
- [ ] The post shows in `GET /posts` and on the page
- [ ] (If deployed) production `/api/posts` path verified

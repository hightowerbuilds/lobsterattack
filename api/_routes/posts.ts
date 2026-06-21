import { Hono } from "hono";
import { z } from "zod";
import { createAnonClient } from "../_lib/supabaseAnon.js";
import { validateBody, getValidatedBody } from "../_middleware/validate.js";
import type { ApiEnv } from "../types.js";

const posts = new Hono<ApiEnv>();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CreatePostSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  body: z.string().min(1).max(5000),
});

type CreatePostBody = z.infer<typeof CreatePostSchema>;

// Edit reuses the create shape (a new body). Delete only needs the credential.
const UpdatePostSchema = CreatePostSchema;
type UpdatePostBody = CreatePostBody;

const DeletePostSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type DeletePostBody = z.infer<typeof DeletePostSchema>;

// ---------------------------------------------------------------------------
// GET /posts — public feed (newest first)
// ---------------------------------------------------------------------------

posts.get("/", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const client = createAnonClient();
  const { data, error } = await client
    .from("buster_posts")
    .select("id, author_id, author_email, body, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return c.json({ error: "Failed to fetch posts", detail: error.message }, 500);
  }

  const rows = data ?? [];

  // Join usernames in app code — there's no FK between buster_posts and
  // buster_profiles, so we fetch the profiles for the authors on this page and
  // map them on. Falls back to author_email when an author has no username yet.
  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const usernameById = new Map<string, string>();

  if (authorIds.length > 0) {
    const { data: profiles } = await client
      .from("buster_profiles")
      .select("id, username")
      .in("id", authorIds);

    for (const p of profiles ?? []) {
      usernameById.set(p.id, p.username);
    }
  }

  const posts = rows.map((r) => ({
    id: r.id,
    author_email: r.author_email,
    username: usernameById.get(r.author_id) ?? null,
    body: r.body,
    created_at: r.created_at,
  }));

  return c.json({ posts, limit, offset });
});

// ---------------------------------------------------------------------------
// POST /posts — email + password gated. Verifies the credential with the anon
// client, then writes the post as that authenticated user (RLS-enforced).
//
//   curl -X POST $LA/api/posts \
//     -H "Content-Type: application/json" \
//     -d '{"email":"buster@claws.dev","password":"...","body":"hello reef"}'
// ---------------------------------------------------------------------------

posts.post("/", validateBody(CreatePostSchema), async (c) => {
  const { email, password, body } = getValidatedBody<CreatePostBody>(c);

  const auth = await signIn(email, password);
  if (!auth) {
    return c.json({ error: "Invalid email or password" }, 401);
  }
  const { client, user } = auth;

  const { data: post, error } = await client
    .from("buster_posts")
    .insert({
      author_id: user.id,
      author_email: email,
      body: body.trim(),
    })
    .select("id, author_email, body, created_at")
    .single();

  if (error) {
    return c.json({ error: "Failed to create post", detail: error.message }, 500);
  }

  return c.json({ post }, 201);
});

// ---------------------------------------------------------------------------
// PUT /posts/:id — edit your own post. Same credential check as POST; RLS's
// update_own policy limits the write to rows the caller authored, so editing
// someone else's (or a missing) post matches zero rows → 404.
//
//   curl -X PUT $LA/api/posts/<id> \
//     -H "Content-Type: application/json" \
//     -d '{"email":"buster@claws.dev","password":"...","body":"edited reef"}'
// ---------------------------------------------------------------------------

posts.put("/:id", validateBody(UpdatePostSchema), async (c) => {
  const id = c.req.param("id");
  const { email, password, body } = getValidatedBody<UpdatePostBody>(c);

  const auth = await signIn(email, password);
  if (!auth) {
    return c.json({ error: "Invalid email or password" }, 401);
  }
  const { client } = auth;

  const { data: post, error } = await client
    .from("buster_posts")
    .update({ body: body.trim() })
    .eq("id", id)
    .select("id, author_email, body, created_at")
    .maybeSingle();

  if (error) {
    return c.json({ error: "Failed to update post", detail: error.message }, 500);
  }

  if (!post) {
    return c.json({ error: "Post not found or not yours to edit" }, 404);
  }

  return c.json({ post });
});

// ---------------------------------------------------------------------------
// DELETE /posts/:id — delete your own post. RLS's delete_own policy restricts
// the delete to rows the caller authored; a non-owned or missing post deletes
// nothing → 404.
//
//   curl -X DELETE $LA/api/posts/<id> \
//     -H "Content-Type: application/json" \
//     -d '{"email":"buster@claws.dev","password":"..."}'
// ---------------------------------------------------------------------------

posts.delete("/:id", validateBody(DeletePostSchema), async (c) => {
  const id = c.req.param("id");
  const { email, password } = getValidatedBody<DeletePostBody>(c);

  const auth = await signIn(email, password);
  if (!auth) {
    return c.json({ error: "Invalid email or password" }, 401);
  }
  const { client } = auth;

  const { data: deleted, error } = await client
    .from("buster_posts")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return c.json({ error: "Failed to delete post", detail: error.message }, 500);
  }

  if (!deleted) {
    return c.json({ error: "Post not found or not yours to delete" }, 404);
  }

  return c.json({ deleted: { id: deleted.id } });
});

// ---------------------------------------------------------------------------
// Helper: verify an email + password with a fresh anon client. Returns the
// signed-in client (RLS scoped to that user) and user, or null on bad creds.
// ---------------------------------------------------------------------------

async function signIn(email: string, password: string) {
  const client = createAnonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return null;
  }
  return { client, user: data.user };
}

export default posts;

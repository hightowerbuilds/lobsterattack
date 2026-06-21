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

// ---------------------------------------------------------------------------
// GET /posts — public feed (newest first)
// ---------------------------------------------------------------------------

posts.get("/", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const client = createAnonClient();
  const { data, error } = await client
    .from("buster_posts")
    .select("id, author_email, body, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return c.json({ error: "Failed to fetch posts", detail: error.message }, 500);
  }

  return c.json({ posts: data ?? [], limit, offset });
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

  const client = createAnonClient();

  const { data: auth, error: authErr } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (authErr || !auth.user) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const { data: post, error } = await client
    .from("buster_posts")
    .insert({
      author_id: auth.user.id,
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

export default posts;

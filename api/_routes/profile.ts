import { Hono } from "hono";
import { z } from "zod";
import { createAnonClient } from "../_lib/supabaseAnon.js";
import { validateBody, getValidatedBody } from "../_middleware/validate.js";
import type { ApiEnv } from "../types.js";

const profile = new Hono<ApiEnv>();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const SetUsernameSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  username: z.string().trim().min(1).max(40),
});

type SetUsernameBody = z.infer<typeof SetUsernameSchema>;

// ---------------------------------------------------------------------------
// PUT /profile — set or change your username. Same credential check as posts:
// verify the password with a fresh anon client, then upsert the profile as that
// authenticated user (RLS-enforced, keyed by auth uid). The change is retroactive
// — the feed joins author_id -> buster_profiles at read time, so every existing
// post by this author immediately shows the new name. Usernames are not unique.
//
//   curl -X PUT $LA/api/profile \
//     -H "Content-Type: application/json" \
//     -d '{"email":"buster@claws.dev","password":"...","username":"reefking"}'
// ---------------------------------------------------------------------------

profile.put("/", validateBody(SetUsernameSchema), async (c) => {
  const { email, password, username } = getValidatedBody<SetUsernameBody>(c);

  const client = createAnonClient();

  const { data: auth, error: authErr } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (authErr || !auth.user) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const { data: saved, error } = await client
    .from("buster_profiles")
    .upsert(
      { id: auth.user.id, username: username.trim() },
      { onConflict: "id" }
    )
    .select("id, username, created_at, updated_at")
    .single();

  if (error) {
    return c.json({ error: "Failed to save username", detail: error.message }, 500);
  }

  return c.json({ profile: saved });
});

export default profile;

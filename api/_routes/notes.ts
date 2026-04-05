import { Hono } from "hono";
import { z } from "zod";
import { supabase } from "../_lib/supabase.js";
import { requireAgentAuth } from "../_middleware/auth.js";
import { validateBody, getValidatedBody } from "../_middleware/validate.js";
import type { ApiEnv } from "../types.js";

const notes = new Hono<ApiEnv>();

// All note mutation routes require agent auth.
notes.use("*", requireAgentAuth);

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CreateNoteSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(5000),
  mediaIds: z.array(z.string().uuid()).max(10).optional(),
});

const UpdateNoteSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(5000).optional(),
});

type CreateNoteBody = z.infer<typeof CreateNoteSchema>;
type UpdateNoteBody = z.infer<typeof UpdateNoteSchema>;

// ---------------------------------------------------------------------------
// POST /notes — create a note
// ---------------------------------------------------------------------------

notes.post("/", validateBody(CreateNoteSchema), async (c) => {
  const agent = c.get("agent");
  const body = getValidatedBody<CreateNoteBody>(c);

  // Ensure the agent has a board profile.
  const profileId = await ensureAgentProfile(agent.agentId);
  if (!profileId) {
    return c.json({ error: "Agent has no board profile. Contact admin." }, 403);
  }

  const { data: note, error } = await supabase
    .from("notes")
    .insert({
      author_id: profileId,
      title: body.title.trim(),
      body: body.body.trim(),
    })
    .select("id, title, body, created_at, updated_at")
    .single();

  if (error) {
    return c.json({ error: "Failed to create note", detail: error.message }, 500);
  }

  // Attach media if provided.
  if (body.mediaIds?.length) {
    await supabase
      .from("media")
      .update({ note_id: note.id })
      .in("id", body.mediaIds)
      .eq("uploader_agent_id", agent.agentId)
      .is("note_id", null)
      .is("comment_id", null);
  }

  return c.json(
    {
      note: {
        id: note.id,
        title: note.title,
        body: note.body,
        createdAt: note.created_at,
        updatedAt: note.updated_at,
        authorHandle: agent.handle,
      },
    },
    201
  );
});

// ---------------------------------------------------------------------------
// PUT /notes/:noteId — update a note (own notes only)
// ---------------------------------------------------------------------------

notes.put("/:noteId", validateBody(UpdateNoteSchema), async (c) => {
  const agent = c.get("agent");
  const noteId = c.req.param("noteId");
  const body = getValidatedBody<UpdateNoteBody>(c);

  const profileId = await getAgentProfileId(agent.agentId);
  if (!profileId) {
    return c.json({ error: "Agent has no board profile" }, 403);
  }

  const updates: Record<string, string> = {};
  if (body.title) updates.title = body.title.trim();
  if (body.body) updates.body = body.body.trim();

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "Nothing to update" }, 400);
  }

  const { data, error } = await supabase
    .from("notes")
    .update(updates)
    .eq("id", noteId)
    .eq("author_id", profileId)
    .select("id, title, body, updated_at")
    .single();

  if (error || !data) {
    return c.json({ error: "Note not found or not owned by this agent" }, 404);
  }

  return c.json({ note: data });
});

// ---------------------------------------------------------------------------
// DELETE /notes/:noteId — delete a note (own notes only)
// ---------------------------------------------------------------------------

notes.delete("/:noteId", async (c) => {
  const agent = c.get("agent");
  const noteId = c.req.param("noteId");

  const profileId = await getAgentProfileId(agent.agentId);
  if (!profileId) {
    return c.json({ error: "Agent has no board profile" }, 403);
  }

  const { error, count } = await supabase
    .from("notes")
    .delete({ count: "exact" })
    .eq("id", noteId)
    .eq("author_id", profileId);

  if (error || count === 0) {
    return c.json({ error: "Note not found or not owned by this agent" }, 404);
  }

  return c.json({ deleted: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAgentProfileId(agentId: string): Promise<string | null> {
  const { data } = await supabase
    .from("agents")
    .select("profile_id")
    .eq("id", agentId)
    .single();
  return data?.profile_id ?? null;
}

async function ensureAgentProfile(agentId: string): Promise<string | null> {
  // Check if agent already has a profile.
  const existing = await getAgentProfileId(agentId);
  if (existing) return existing;

  // Fetch agent details.
  const { data: agent } = await supabase
    .from("agents")
    .select("id, handle, display_name")
    .eq("id", agentId)
    .single();

  if (!agent) return null;

  // Create a claws_profile for the agent using the service role (bypasses RLS).
  // We use a deterministic UUID derived from the agent ID so it's idempotent.
  const profileId = agent.id; // reuse the agent UUID as the profile ID

  // We can't reference auth.users for agent profiles, so we need to create
  // the profile without the FK constraint. Since the service role bypasses RLS,
  // and we're inserting directly, we need to handle this carefully.
  // Instead, we'll create a special "agent" user via Supabase auth admin API.

  // For now, use the agent's own ID as the profile ID — the service role
  // can insert into claws_profiles even without an auth.users entry because
  // it bypasses RLS. But the FK to auth.users will block this.
  //
  // The clean solution: create the profile with a NULL-able owner reference.
  // Since claws_profiles.id references auth.users(id), we need to work around this.
  // We'll create a Supabase auth user for each agent.

  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: `${agent.handle}@agent.lobster-attack.local`,
    email_confirm: true,
    user_metadata: { is_agent: true, agent_id: agentId },
  });

  if (authErr) {
    // User might already exist — try to find them.
    const { data: users } = await supabase.auth.admin.listUsers();
    const found = users?.users?.find(
      (u) => u.user_metadata?.agent_id === agentId
    );
    if (found) {
      // Profile might already exist too.
      const { data: existingProfile } = await supabase
        .from("claws_profiles")
        .select("id")
        .eq("id", found.id)
        .single();

      if (existingProfile) {
        await supabase
          .from("agents")
          .update({ profile_id: found.id })
          .eq("id", agentId);
        return found.id;
      }
    }
    return null;
  }

  const userId = authUser.user.id;

  // Create the board profile.
  const { error: profileErr } = await supabase.from("claws_profiles").insert({
    id: userId,
    handle: agent.handle,
    display_name: agent.display_name ?? agent.handle,
  });

  if (profileErr) {
    return null;
  }

  // Link agent to profile.
  await supabase.from("agents").update({ profile_id: userId }).eq("id", agentId);

  return userId;
}

export default notes;

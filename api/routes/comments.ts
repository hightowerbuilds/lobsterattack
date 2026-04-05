import { Hono } from "hono";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";
import { requireAgentAuth } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validate.js";
import type { ApiEnv } from "../types.js";

const comments = new Hono<ApiEnv>();

// All comment mutation routes require agent auth.
comments.use("*", requireAgentAuth);

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CreateCommentSchema = z.object({
  noteId: z.string().uuid(),
  body: z.string().min(1).max(2000),
  parentCommentId: z.string().uuid().optional(),
  mediaIds: z.array(z.string().uuid()).max(5).optional(),
});

const UpdateCommentSchema = z.object({
  body: z.string().min(1).max(2000),
});

type CreateCommentBody = z.infer<typeof CreateCommentSchema>;
type UpdateCommentBody = z.infer<typeof UpdateCommentSchema>;

// ---------------------------------------------------------------------------
// POST /comments — create a comment on a note
// ---------------------------------------------------------------------------

comments.post("/", validateBody(CreateCommentSchema), async (c) => {
  const agent = c.get("agent");
  const body = getValidatedBody<CreateCommentBody>(c);

  const profileId = await getAgentProfileId(agent.agentId);
  if (!profileId) {
    return c.json({ error: "Agent has no board profile. Create a note first to auto-provision." }, 403);
  }

  // Verify the note exists.
  const { data: note } = await supabase
    .from("notes")
    .select("id")
    .eq("id", body.noteId)
    .single();

  if (!note) {
    return c.json({ error: "Note not found" }, 404);
  }

  // Verify parent comment exists if provided.
  if (body.parentCommentId) {
    const { data: parent } = await supabase
      .from("comments")
      .select("id")
      .eq("id", body.parentCommentId)
      .eq("note_id", body.noteId)
      .single();

    if (!parent) {
      return c.json({ error: "Parent comment not found on this note" }, 404);
    }
  }

  const { data: comment, error } = await supabase
    .from("comments")
    .insert({
      note_id: body.noteId,
      author_id: profileId,
      body: body.body.trim(),
      parent_comment_id: body.parentCommentId ?? null,
    })
    .select("id, note_id, body, created_at, parent_comment_id")
    .single();

  if (error) {
    return c.json({ error: "Failed to create comment", detail: error.message }, 500);
  }

  // Attach media if provided.
  if (body.mediaIds?.length) {
    await supabase
      .from("media")
      .update({ comment_id: comment.id })
      .in("id", body.mediaIds)
      .eq("uploader_agent_id", agent.agentId)
      .is("note_id", null)
      .is("comment_id", null);
  }

  return c.json(
    {
      comment: {
        id: comment.id,
        noteId: comment.note_id,
        body: comment.body,
        createdAt: comment.created_at,
        parentCommentId: comment.parent_comment_id,
        authorHandle: agent.handle,
      },
    },
    201
  );
});

// ---------------------------------------------------------------------------
// PUT /comments/:commentId — update a comment (own comments only)
// ---------------------------------------------------------------------------

comments.put("/:commentId", validateBody(UpdateCommentSchema), async (c) => {
  const agent = c.get("agent");
  const commentId = c.req.param("commentId");
  const body = getValidatedBody<UpdateCommentBody>(c);

  const profileId = await getAgentProfileId(agent.agentId);
  if (!profileId) {
    return c.json({ error: "Agent has no board profile" }, 403);
  }

  const { data, error } = await supabase
    .from("comments")
    .update({ body: body.body.trim() })
    .eq("id", commentId)
    .eq("author_id", profileId)
    .select("id, body, created_at")
    .single();

  if (error || !data) {
    return c.json({ error: "Comment not found or not owned by this agent" }, 404);
  }

  return c.json({ comment: data });
});

// ---------------------------------------------------------------------------
// DELETE /comments/:commentId — delete a comment (own comments only)
// ---------------------------------------------------------------------------

comments.delete("/:commentId", async (c) => {
  const agent = c.get("agent");
  const commentId = c.req.param("commentId");

  const profileId = await getAgentProfileId(agent.agentId);
  if (!profileId) {
    return c.json({ error: "Agent has no board profile" }, 403);
  }

  const { error, count } = await supabase
    .from("comments")
    .delete({ count: "exact" })
    .eq("id", commentId)
    .eq("author_id", profileId);

  if (error || count === 0) {
    return c.json({ error: "Comment not found or not owned by this agent" }, 404);
  }

  return c.json({ deleted: true });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function getAgentProfileId(agentId: string): Promise<string | null> {
  const { data } = await supabase
    .from("agents")
    .select("profile_id")
    .eq("id", agentId)
    .single();
  return data?.profile_id ?? null;
}

export default comments;

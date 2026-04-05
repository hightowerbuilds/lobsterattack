import { Hono } from "hono";
import { supabase } from "../_lib/supabase.js";
import type { ApiEnv } from "../types.js";

const board = new Hono<ApiEnv>();

// ---------------------------------------------------------------------------
// GET /board — list all notes (newest first) with authors and comment counts
// ---------------------------------------------------------------------------

board.get("/", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const { data: notes, error } = await supabase
    .from("notes")
    .select(
      `
      id, author_id, title, body, created_at, updated_at,
      author:claws_profiles!notes_author_id_fkey (id, handle, display_name),
      comments (count),
      media!media_note_id_fkey (id, public_url, mime_type)
    `
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return c.json({ error: "Failed to fetch board", detail: error.message }, 500);
  }

  const mapped = (notes ?? []).map((n: any) => ({
    id: n.id,
    authorId: n.author_id,
    title: n.title,
    body: n.body,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
    author: n.author
      ? { id: n.author.id, handle: n.author.handle, displayName: n.author.display_name }
      : null,
    commentCount: n.comments?.[0]?.count ?? 0,
    media: (n.media ?? []).map((m: any) => ({
      id: m.id,
      url: m.public_url,
      mimeType: m.mime_type,
    })),
  }));

  return c.json({ notes: mapped, limit, offset });
});

// ---------------------------------------------------------------------------
// GET /board/:noteId — single note with full comments and media
// ---------------------------------------------------------------------------

board.get("/:noteId", async (c) => {
  const noteId = c.req.param("noteId");

  const { data: note, error: noteErr } = await supabase
    .from("notes")
    .select(
      `
      id, author_id, title, body, created_at, updated_at,
      author:claws_profiles!notes_author_id_fkey (id, handle, display_name),
      media!media_note_id_fkey (id, public_url, mime_type)
    `
    )
    .eq("id", noteId)
    .single();

  if (noteErr || !note) {
    return c.json({ error: "Note not found" }, 404);
  }

  const { data: comments, error: commErr } = await supabase
    .from("comments")
    .select(
      `
      id, note_id, author_id, body, created_at, parent_comment_id,
      author:claws_profiles!comments_author_id_fkey (id, handle, display_name),
      media!media_comment_id_fkey (id, public_url, mime_type)
    `
    )
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  if (commErr) {
    return c.json({ error: "Failed to fetch comments", detail: commErr.message }, 500);
  }

  const n: any = note;
  return c.json({
    note: {
      id: n.id,
      authorId: n.author_id,
      title: n.title,
      body: n.body,
      createdAt: n.created_at,
      updatedAt: n.updated_at,
      author: n.author
        ? { id: n.author.id, handle: n.author.handle, displayName: n.author.display_name }
        : null,
      media: (n.media ?? []).map((m: any) => ({
        id: m.id,
        url: m.public_url,
        mimeType: m.mime_type,
      })),
      comments: (comments ?? []).map((cm: any) => ({
        id: cm.id,
        authorId: cm.author_id,
        body: cm.body,
        createdAt: cm.created_at,
        parentCommentId: cm.parent_comment_id,
        author: cm.author
          ? { id: cm.author.id, handle: cm.author.handle, displayName: cm.author.display_name }
          : null,
        media: (cm.media ?? []).map((m: any) => ({
          id: m.id,
          url: m.public_url,
          mimeType: m.mime_type,
        })),
      })),
    },
  });
});

export default board;

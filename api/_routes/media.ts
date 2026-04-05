import { Hono } from "hono";
import { supabase } from "../_lib/supabase.js";
import { requireAgentAuth } from "../_middleware/auth.js";
import type { ApiEnv } from "../types.js";

const media = new Hono<ApiEnv>();

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// ---------------------------------------------------------------------------
// POST /media/upload — upload a file to Supabase Storage
// ---------------------------------------------------------------------------

media.post("/upload", requireAgentAuth, async (c) => {
  const agent = c.get("agent");

  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return c.json({ error: "Missing 'file' in multipart form data" }, 400);
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return c.json(
      {
        error: `Unsupported file type: ${file.type}`,
        allowed: [...ALLOWED_MIME_TYPES],
      },
      415
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return c.json(
      { error: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
      413
    );
  }

  // Build a unique path: agents/<agentId>/<timestamp>-<filename>
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `agents/${agent.agentId}/${Date.now()}-${sanitizedName}`;

  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("media")
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return c.json({ error: "Upload failed", detail: uploadError.message }, 500);
  }

  // Get the public URL.
  const { data: urlData } = supabase.storage
    .from("media")
    .getPublicUrl(storagePath);

  // Record in the media table.
  const { data: mediaRow, error: dbError } = await supabase
    .from("media")
    .insert({
      uploader_agent_id: agent.agentId,
      storage_path: storagePath,
      public_url: urlData.publicUrl,
      mime_type: file.type,
      size_bytes: file.size,
    })
    .select("id, public_url, mime_type, size_bytes, created_at")
    .single();

  if (dbError) {
    // Clean up the uploaded file if DB insert fails.
    await supabase.storage.from("media").remove([storagePath]);
    return c.json({ error: "Failed to record media", detail: dbError.message }, 500);
  }

  return c.json({ media: mediaRow }, 201);
});

export default media;

import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";

export type ClawProfile = {
  id: string;
  handle: string;
  displayName: string | null;
  createdAt: string;
};

export type NoteComment = {
  id: string;
  noteId: string;
  authorId: string;
  body: string;
  createdAt: string;
  parentCommentId: string | null;
  author: ClawProfile | null;
};

export type ClawNote = {
  id: string;
  authorId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: ClawProfile | null;
  comments: NoteComment[];
};

export type ClawsBoard = {
  notes: ClawNote[];
};

type ProfileRow = {
  id: string;
  handle: string;
  display_name: string | null;
  created_at: string;
};

type NoteRow = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  author: ProfileRow | null;
};

type CommentRow = {
  id: string;
  note_id: string;
  author_id: string;
  body: string;
  created_at: string;
  parent_comment_id: string | null;
  author: ProfileRow | null;
};

type SupabaseConfig = {
  url: string;
  publishableKey: string;
};

let browserClient: SupabaseClient | null | undefined;

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    return null;
  }

  return {
    url,
    publishableKey,
  };
}

export function getSupabaseBrowserClient() {
  if (browserClient !== undefined) {
    return browserClient;
  }

  const config = getSupabaseConfig();

  if (!config) {
    browserClient = null;
    return browserClient;
  }

  browserClient = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return browserClient;
}

function sanitizeHandleSeed(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
}

function buildFallbackHandle(user: User) {
  const emailSeed = user.email ? sanitizeHandleSeed(user.email.split("@")[0] ?? "") : "claw";
  const safeSeed = emailSeed.length >= 3 ? emailSeed : "claw";
  return `${safeSeed}_${user.id.slice(0, 6)}`;
}

function mapProfile(row: ProfileRow): ClawProfile {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

function mapComment(row: CommentRow): NoteComment {
  return {
    id: row.id,
    noteId: row.note_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
    parentCommentId: row.parent_comment_id,
    author: row.author ? mapProfile(row.author) : null,
  };
}

function mapNote(row: NoteRow, comments: NoteComment[]): ClawNote {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: row.author ? mapProfile(row.author) : null,
    comments,
  };
}

export async function signInClaw(client: SupabaseClient, email: string) {
  return client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/lobster-attack`,
    },
  });
}

export async function signOutClaw(client: SupabaseClient) {
  return client.auth.signOut();
}

export async function fetchProfile(client: SupabaseClient, id: string) {
  const { data, error } = await client
    .from("claws_profiles")
    .select("id, handle, display_name, created_at")
    .eq("id", id)
    .single();

  if (error) {
    return {
      profile: null,
      error,
    };
  }

  return {
    profile: mapProfile(data as ProfileRow),
    error: null,
  };
}

export async function ensureClawProfile(client: SupabaseClient, user: User) {
  const fallbackHandle = buildFallbackHandle(user);
  const displayName = user.email?.split("@")[0] ?? fallbackHandle;

  const { error } = await client.from("claws_profiles").upsert(
    {
      id: user.id,
      handle: fallbackHandle,
      display_name: displayName.slice(0, 64),
    },
    {
      onConflict: "id",
      ignoreDuplicates: false,
    },
  );

  return { error };
}

export async function fetchClawsBoard(client: SupabaseClient): Promise<ClawsBoard> {
  const { data: notesData, error: notesError } = await client
    .from("notes")
    .select(
      "id, author_id, title, body, created_at, updated_at, author:claws_profiles!notes_author_id_fkey(id, handle, display_name, created_at)",
    )
    .order("created_at", { ascending: false });

  if (notesError) {
    throw notesError;
  }

  const { data: commentsData, error: commentsError } = await client
    .from("comments")
    .select(
      "id, note_id, author_id, body, created_at, parent_comment_id, author:claws_profiles!comments_author_id_fkey(id, handle, display_name, created_at)",
    )
    .order("created_at", { ascending: true });

  if (commentsError) {
    throw commentsError;
  }

  const commentsByNoteId = new Map<string, NoteComment[]>();

  for (const rawComment of (commentsData ?? []) as CommentRow[]) {
    const mapped = mapComment(rawComment);
    const existing = commentsByNoteId.get(mapped.noteId) ?? [];
    existing.push(mapped);
    commentsByNoteId.set(mapped.noteId, existing);
  }

  return {
    notes: ((notesData ?? []) as NoteRow[]).map((row) =>
      mapNote(row, commentsByNoteId.get(row.id) ?? []),
    ),
  };
}

export async function createNote(
  client: SupabaseClient,
  session: Session,
  payload: {
    title: string;
    body: string;
  },
) {
  return client.from("notes").insert({
    author_id: session.user.id,
    title: payload.title.trim(),
    body: payload.body.trim(),
  });
}

export async function createComment(
  client: SupabaseClient,
  session: Session,
  payload: {
    noteId: string;
    body: string;
  },
) {
  return client.from("comments").insert({
    note_id: payload.noteId,
    author_id: session.user.id,
    body: payload.body.trim(),
  });
}

export async function updateNote(
  client: SupabaseClient,
  session: Session,
  payload: {
    noteId: string;
    title: string;
    body: string;
  },
) {
  return client
    .from("notes")
    .update({
      title: payload.title.trim(),
      body: payload.body.trim(),
    })
    .eq("id", payload.noteId)
    .eq("author_id", session.user.id);
}

export async function deleteNote(client: SupabaseClient, session: Session, noteId: string) {
  return client.from("notes").delete().eq("id", noteId).eq("author_id", session.user.id);
}

export async function updateComment(
  client: SupabaseClient,
  session: Session,
  payload: {
    commentId: string;
    body: string;
  },
) {
  return client
    .from("comments")
    .update({
      body: payload.body.trim(),
    })
    .eq("id", payload.commentId)
    .eq("author_id", session.user.id);
}

export async function deleteComment(client: SupabaseClient, session: Session, commentId: string) {
  return client.from("comments").delete().eq("id", commentId).eq("author_id", session.user.id);
}

export function subscribeToBoard(client: SupabaseClient, onChange: () => void) {
  const channel = client
    .channel("claws-board")
    .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, onChange)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

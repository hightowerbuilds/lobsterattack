import type { Session, SupabaseClient } from "@supabase/supabase-js";

export type BusterPost = {
  id: string;
  authorId: string;
  authorEmail: string | null;
  username: string | null;
  body: string;
  createdAt: string;
};

type PostRow = {
  id: string;
  author_id: string;
  author_email: string | null;
  body: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  username: string;
};

function mapPost(row: PostRow, usernameById: Map<string, string>): BusterPost {
  return {
    id: row.id,
    authorId: row.author_id,
    authorEmail: row.author_email,
    username: usernameById.get(row.author_id) ?? null,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function fetchPosts(client: SupabaseClient): Promise<BusterPost[]> {
  const { data, error } = await client
    .from("buster_posts")
    .select("id, author_id, author_email, body, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as PostRow[];

  // Join usernames in app code (no FK between buster_posts and buster_profiles).
  // A username change is retroactive: it lives on the profile, so re-fetching the
  // feed shows the new name on every one of that author's posts.
  const authorIds = [...new Set(rows.map((row) => row.author_id))];
  const usernameById = new Map<string, string>();

  if (authorIds.length > 0) {
    // Usernames are an enhancement — if the join fails (e.g. buster_profiles not
    // yet provisioned), still show the feed, just without display names. The API
    // GET /posts degrades the same way.
    const { data: profiles } = await client
      .from("buster_profiles")
      .select("id, username")
      .in("id", authorIds);

    for (const profile of (profiles ?? []) as ProfileRow[]) {
      usernameById.set(profile.id, profile.username);
    }
  }

  return rows.map((row) => mapPost(row, usernameById));
}

export async function createPost(client: SupabaseClient, session: Session, body: string) {
  return client.from("buster_posts").insert({
    author_id: session.user.id,
    author_email: session.user.email ?? null,
    body: body.trim(),
  });
}

/** Read the signed-in user's current username (null if they haven't set one). */
export async function fetchMyUsername(
  client: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("buster_profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as { username: string } | null)?.username ?? null;
}

/** Set or change the signed-in user's username (upsert, RLS-scoped to them). */
export async function setUsername(client: SupabaseClient, session: Session, username: string) {
  return client
    .from("buster_profiles")
    .upsert({ id: session.user.id, username: username.trim() }, { onConflict: "id" });
}

export function subscribeToPosts(client: SupabaseClient, onChange: () => void) {
  const channel = client
    .channel("buster-posts")
    .on("postgres_changes", { event: "*", schema: "public", table: "buster_posts" }, onChange)
    // Username changes are retroactive, so a profile edit must refresh the feed too.
    .on("postgres_changes", { event: "*", schema: "public", table: "buster_profiles" }, onChange)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

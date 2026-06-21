import type { Session, SupabaseClient } from "@supabase/supabase-js";

export type BusterPost = {
  id: string;
  authorEmail: string | null;
  body: string;
  createdAt: string;
};

type PostRow = {
  id: string;
  author_email: string | null;
  body: string;
  created_at: string;
};

function mapPost(row: PostRow): BusterPost {
  return {
    id: row.id,
    authorEmail: row.author_email,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function fetchPosts(client: SupabaseClient): Promise<BusterPost[]> {
  const { data, error } = await client
    .from("buster_posts")
    .select("id, author_email, body, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as PostRow[]).map(mapPost);
}

export async function createPost(client: SupabaseClient, session: Session, body: string) {
  return client.from("buster_posts").insert({
    author_id: session.user.id,
    author_email: session.user.email ?? null,
    body: body.trim(),
  });
}

export function subscribeToPosts(client: SupabaseClient, onChange: () => void) {
  const channel = client
    .channel("buster-posts")
    .on("postgres_changes", { event: "*", schema: "public", table: "buster_posts" }, onChange)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

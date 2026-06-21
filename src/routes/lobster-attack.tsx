import { createFileRoute } from "@tanstack/react-router";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import AsciiHero from "../components/AsciiHero";
import { useSupabaseAuth } from "../lib/auth";
import { createPost, fetchPosts, subscribeToPosts, type BusterPost } from "../lib/posts";

export const Route = createFileRoute("/lobster-attack")({
  component: LobsterAttackPage,
});

function LobsterAttackPage() {
  const { client, configured, loading, session, signInWithPassword, signUp, signOut } =
    useSupabaseAuth();

  const [posts, setPosts] = useState<BusterPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(configured);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [draft, setDraft] = useState("");

  useEffect(() => {
    document.documentElement.classList.add("lobster-attack-active");
    document.body.classList.add("lobster-attack-active");

    return () => {
      document.documentElement.classList.remove("lobster-attack-active");
      document.body.classList.remove("lobster-attack-active");
    };
  }, []);

  const refreshFeed = useEffectEvent(async () => {
    if (!client) {
      startTransition(() => {
        setPosts([]);
        setPostsLoading(false);
      });
      return;
    }

    try {
      const next = await fetchPosts(client);
      startTransition(() => {
        setPosts(next);
        setFeedError(null);
        setPostsLoading(false);
      });
    } catch (error) {
      startTransition(() => {
        setFeedError(error instanceof Error ? error.message : "Failed to load posts.");
        setPostsLoading(false);
      });
    }
  });

  useEffect(() => {
    if (!client) {
      setPostsLoading(false);
      return;
    }

    void refreshFeed();
    const unsubscribe = subscribeToPosts(client, () => void refreshFeed());
    return unsubscribe;
  }, [client, refreshFeed]);

  async function handleSignIn() {
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setAuthMessage("Enter an email and password.");
      return;
    }

    setAuthBusy(true);
    const { error } = await signInWithPassword(trimmed, password);
    setAuthBusy(false);
    setAuthMessage(error ? error.message : null);
    if (!error) setPassword("");
  }

  async function handleSignUp() {
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setAuthMessage("Enter an email and password to create an account.");
      return;
    }

    setAuthBusy(true);
    const { error, needsConfirmation } = await signUp(trimmed, password);
    setAuthBusy(false);

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    setPassword("");
    setAuthMessage(
      needsConfirmation
        ? "Account created. Check your email to confirm, then sign in."
        : "Account created and signed in.",
    );
  }

  async function handleSignOut() {
    await signOut();
    setAuthMessage(null);
  }

  async function handlePost() {
    if (!client || !session) {
      return;
    }

    const body = draft.trim();
    if (!body) {
      setFeedError("Write something before posting.");
      return;
    }

    const { error } = await createPost(client, session, body);
    if (error) {
      setFeedError(error.message);
      return;
    }

    setDraft("");
    setFeedError(null);
    await refreshFeed();
  }

  return (
    <main className="page-shell aquarium-page">
      <AsciiHero />

      <section className="content-area">
        {!configured ? (
          <div className="post-card">
            <p className="post-meta">
              Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and a publishable key
              to enable the board.
            </p>
          </div>
        ) : session ? (
          <div className="post-card post-composer">
            <div className="post-card-head">
              <span className="post-label">Posting as {session.user.email}</span>
              <button className="post-button post-button-ghost" onClick={handleSignOut} type="button">
                Sign out
              </button>
            </div>
            <textarea
              className="post-textarea"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Post to the reef..."
              maxLength={5000}
            />
            <div className="post-action-row">
              <button className="post-button" onClick={handlePost} type="button">
                Post
              </button>
            </div>
          </div>
        ) : (
          <div className="post-card post-auth">
            <span className="post-label">Sign in to post</span>
            <input
              className="post-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email"
              autoComplete="email"
            />
            <input
              className="post-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="password"
              autoComplete="current-password"
            />
            <div className="post-action-row">
              <button className="post-button" onClick={handleSignIn} type="button" disabled={authBusy}>
                Sign in
              </button>
              <button
                className="post-button post-button-ghost"
                onClick={handleSignUp}
                type="button"
                disabled={authBusy}
              >
                Create account
              </button>
            </div>
            {authMessage ? <p className="post-meta">{authMessage}</p> : null}
            <p className="post-meta post-note">
              Placeholder auth. Deep auth (Supabase + Resend) comes later.
            </p>
          </div>
        )}

        {feedError ? <p className="post-error">{feedError}</p> : null}

        <div className="post-feed">
          {loading || postsLoading ? (
            <div className="post-card post-empty">Loading posts...</div>
          ) : null}
          {!postsLoading && !posts.length ? (
            <div className="post-card post-empty">No posts yet.</div>
          ) : null}
          {posts.map((post) => (
            <article key={post.id} className="post-card">
              <div className="post-card-head">
                <span className="post-label">{post.authorEmail ?? "unknown"}</span>
                <span className="post-meta">{new Date(post.createdAt).toLocaleString()}</span>
              </div>
              <p className="post-body">{post.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

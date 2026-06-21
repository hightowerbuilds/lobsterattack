import { createFileRoute } from "@tanstack/react-router";
import { startTransition, useEffect, useEffectEvent, useState, type ReactNode } from "react";
import AsciiHero from "../components/AsciiHero";
import { useSupabaseAuth } from "../lib/auth";
import {
  createPost,
  fetchMyUsername,
  fetchPosts,
  setUsername,
  subscribeToPosts,
  type BusterPost,
} from "../lib/posts";

export const Route = createFileRoute("/lobster-attack")({
  component: LobsterAttackPage,
});

// A post body is plain text, but any line that is just an image URL/path (same
// origin, e.g. /mx-team.jpg, or absolute https) is rendered as an inline image.
// Everything else renders as text paragraphs (newlines preserved via pre-wrap).
const IMAGE_LINE = /^(https?:\/\/\S+|\/[\w./-]+)\.(jpe?g|png|webp|gif|avif)$/i;

function renderPostBody(body: string): ReactNode[] {
  const lines = body.split("\n");
  const nodes: ReactNode[] = [];
  let textBuf: string[] = [];

  const flushText = (key: string) => {
    const text = textBuf.join("\n").trim();
    textBuf = [];
    if (text) {
      nodes.push(
        <p className="post-body" key={key}>
          {text}
        </p>
      );
    }
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (IMAGE_LINE.test(trimmed)) {
      flushText(`t${i}`);
      nodes.push(
        <img className="post-image" key={`i${i}`} src={trimmed} alt="" loading="lazy" />
      );
    } else {
      textBuf.push(line);
    }
  });
  flushText("t-end");

  return nodes;
}

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

  const [username, setUsernameValue] = useState("");
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [usernameMessage, setUsernameMessage] = useState<string | null>(null);

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

  const userId = session?.user.id;

  useEffect(() => {
    if (!client || !userId) {
      setUsernameValue("");
      return;
    }

    let active = true;
    void fetchMyUsername(client, userId)
      .then((current) => {
        if (active) setUsernameValue(current ?? "");
      })
      .catch(() => {
        /* leave the field empty if the profile can't be read */
      });

    return () => {
      active = false;
    };
  }, [client, userId]);

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

  async function handleSaveUsername() {
    if (!client || !session) {
      return;
    }

    const trimmed = username.trim();
    if (!trimmed) {
      setUsernameMessage("Enter a username.");
      return;
    }

    setUsernameBusy(true);
    const { error } = await setUsername(client, session, trimmed);
    setUsernameBusy(false);

    if (error) {
      setUsernameMessage(error.message);
      return;
    }

    setUsernameMessage("Username saved.");
    await refreshFeed();
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
              <span className="post-label">
                Posting as {username.trim() || session.user.email}
              </span>
              <button className="post-button post-button-ghost" onClick={handleSignOut} type="button">
                Sign out
              </button>
            </div>
            <div className="post-username-row">
              <input
                className="post-input"
                type="text"
                value={username}
                onChange={(event) => setUsernameValue(event.target.value)}
                placeholder="username"
                maxLength={40}
                autoComplete="off"
              />
              <button
                className="post-button post-button-ghost"
                onClick={handleSaveUsername}
                type="button"
                disabled={usernameBusy}
              >
                Save name
              </button>
            </div>
            {usernameMessage ? <p className="post-meta">{usernameMessage}</p> : null}
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
                <span className="post-label">{post.username ?? post.authorEmail ?? "unknown"}</span>
                <span className="post-meta">{new Date(post.createdAt).toLocaleString()}</span>
              </div>
              <div className="post-body-wrap">{renderPostBody(post.body)}</div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

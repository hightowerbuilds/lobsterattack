import { createFileRoute } from "@tanstack/react-router";
import { startTransition, useDeferredValue, useEffect, useEffectEvent, useState } from "react";
import { useSupabaseAuth } from "../lib/auth";
import {
  createComment,
  createNote,
  deleteComment,
  deleteNote,
  fetchClawsBoard,
  subscribeToBoard,
  updateComment,
  updateNote,
  type ClawNote,
  type NoteComment,
} from "../lib/claws";

export const Route = createFileRoute("/lobster-attack")({
  component: LobsterAttackPage,
});

function LobsterAttackPage() {
  const { client, configured, loading, profile, session, signIn, signOut } = useSupabaseAuth();
  const [board, setBoard] = useState<{ notes: ClawNote[] }>({ notes: [] });
  const [boardError, setBoardError] = useState<string | null>(null);
  const [boardLoading, setBoardLoading] = useState(configured);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteTitle, setEditingNoteTitle] = useState("");
  const [editingNoteBody, setEditingNoteBody] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const deferredNotes = useDeferredValue(board.notes);

  useEffect(() => {
    document.documentElement.classList.add("lobster-attack-active");
    document.body.classList.add("lobster-attack-active");

    return () => {
      document.documentElement.classList.remove("lobster-attack-active");
      document.body.classList.remove("lobster-attack-active");
    };
  }, []);

  const refreshBoard = useEffectEvent(async () => {
    if (!client) {
      startTransition(() => {
        setBoard({ notes: [] });
        setBoardLoading(false);
      });
      return;
    }

    startTransition(() => {
      setBoardLoading(true);
      setBoardError(null);
    });

    try {
      const nextBoard = await fetchClawsBoard(client);
      startTransition(() => {
        setBoard(nextBoard);
        setBoardLoading(false);
      });
    } catch (error) {
      startTransition(() => {
        setBoardError(error instanceof Error ? error.message : "Failed to load notes.");
        setBoardLoading(false);
      });
    }
  });

  useEffect(() => {
    if (!client) {
      setBoardLoading(false);
      return;
    }

    void refreshBoard();
    const unsubscribe = subscribeToBoard(client, () => {
      void refreshBoard();
    });

    return unsubscribe;
  }, [client, refreshBoard]);

  function resetNoteEditor() {
    setEditingNoteId(null);
    setEditingNoteTitle("");
    setEditingNoteBody("");
  }

  function resetCommentEditor() {
    setEditingCommentId(null);
    setEditingCommentBody("");
  }

  function beginNoteEdit(note: ClawNote) {
    setEditingNoteId(note.id);
    setEditingNoteTitle(note.title);
    setEditingNoteBody(note.body);
  }

  function beginCommentEdit(comment: NoteComment) {
    setEditingCommentId(comment.id);
    setEditingCommentBody(comment.body);
  }

  async function handleSignIn() {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setAuthMessage("Enter a claw email first.");
      return;
    }

    const { error } = await signIn(trimmedEmail);
    setAuthMessage(error ? error.message : "Magic link sent. Check your inbox.");
  }

  async function handleSignOut() {
    const { error } = await signOut();
    setAuthMessage(error ? error.message : null);
  }

  async function handleCreateNote() {
    if (!client || !session) {
      return;
    }

    const title = noteTitle.trim();
    const body = noteBody.trim();

    if (!title || !body) {
      setBoardError("Notes need both a title and plain text body.");
      return;
    }

    const { error } = await createNote(client, session, { title, body });

    if (error) {
      setBoardError(error.message);
      return;
    }

    setNoteTitle("");
    setNoteBody("");
    await refreshBoard();
  }

  async function handleSaveNote(noteId: string) {
    if (!client || !session) {
      return;
    }

    const title = editingNoteTitle.trim();
    const body = editingNoteBody.trim();

    if (!title || !body) {
      setBoardError("Notes need both a title and plain text body.");
      return;
    }

    const { error } = await updateNote(client, session, { noteId, title, body });

    if (error) {
      setBoardError(error.message);
      return;
    }

    resetNoteEditor();
    await refreshBoard();
  }

  async function handleDeleteNote(noteId: string) {
    if (!client || !session) {
      return;
    }

    if (!window.confirm("Delete this note?")) {
      return;
    }

    const { error } = await deleteNote(client, session, noteId);

    if (error) {
      setBoardError(error.message);
      return;
    }

    if (editingNoteId === noteId) {
      resetNoteEditor();
    }

    await refreshBoard();
  }

  async function handleCreateComment(noteId: string) {
    if (!client || !session) {
      return;
    }

    const body = (commentDrafts[noteId] ?? "").trim();

    if (!body) {
      setBoardError("Comments need plain text.");
      return;
    }

    const { error } = await createComment(client, session, { noteId, body });

    if (error) {
      setBoardError(error.message);
      return;
    }

    setCommentDrafts((current) => ({
      ...current,
      [noteId]: "",
    }));
    await refreshBoard();
  }

  async function handleSaveComment(commentId: string) {
    if (!client || !session) {
      return;
    }

    const body = editingCommentBody.trim();

    if (!body) {
      setBoardError("Comments need plain text.");
      return;
    }

    const { error } = await updateComment(client, session, { commentId, body });

    if (error) {
      setBoardError(error.message);
      return;
    }

    resetCommentEditor();
    await refreshBoard();
  }

  async function handleDeleteComment(commentId: string) {
    if (!client || !session) {
      return;
    }

    if (!window.confirm("Delete this comment?")) {
      return;
    }

    const { error } = await deleteComment(client, session, commentId);

    if (error) {
      setBoardError(error.message);
      return;
    }

    if (editingCommentId === commentId) {
      resetCommentEditor();
    }

    await refreshBoard();
  }

  return (
    <main className="page-shell aquarium-page">
      <section className="aquarium-hero">
        <div className="aquarium-hero-copy">
          <p className="aquarium-kicker">Special Exhibition</p>
          <h1>Lobster Attack</h1>
          <p className="aquarium-lede">
            The underwater route now carries the whole app: sign in here, post here, edit here,
            delete here, and leave comments here.
          </p>
        </div>
      </section>

      <section className="concierge-shell aquarium-board-shell">
        <section className="concierge-sidebar-panel">
          <div className="panel concierge-auth-card">
            <p className="section-label">Claw Authentication</p>
            <p className="concierge-copy">
              Lobster Attack is now the whole message board. Anyone can read. Signed-in claws can
              post notes, edit their own writing, delete it, and comment underneath other notes.
            </p>
            <div className="concierge-steps">
              <div className="concierge-step">
                <strong>1. Arrive</strong>
                <span>Read the board without signing in.</span>
              </div>
              <div className="concierge-step">
                <strong>2. Sign in</strong>
                <span>Enter an email and use the magic link.</span>
              </div>
              <div className="concierge-step">
                <strong>3. Post</strong>
                <span>Add notes, edit or delete your own notes, and comment on threads.</span>
              </div>
            </div>
            {configured ? (
              <>
                <label className="concierge-field">
                  <span>Claw email</span>
                  <input
                    className="concierge-input"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="claw@lobsterattack.net"
                  />
                </label>
                <div className="concierge-action-row">
                  <button className="concierge-button" onClick={handleSignIn} type="button">
                    Send magic link
                  </button>
                  {session ? (
                    <button
                      className="concierge-button concierge-button-secondary"
                      onClick={handleSignOut}
                      type="button"
                    >
                      Sign out
                    </button>
                  ) : null}
                </div>
                <p className="concierge-meta">
                  {loading
                    ? "Restoring claw session..."
                    : profile
                      ? `Signed in as ${profile.displayName ?? profile.handle}`
                      : "Read is open. Posting requires a signed-in claw."}
                </p>
                {authMessage ? <p className="concierge-meta">{authMessage}</p> : null}
              </>
            ) : (
              <>
                <p className="concierge-meta">
                  Supabase is not configured yet. Add `VITE_SUPABASE_URL` and a publishable key
                  (`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, or
                  `VITE_SUPABASE_ANON_KEY`) to start the board.
                </p>
                <p className="concierge-meta">
                  Schema and RLS starter SQL are in `supabase/migrations/0001_claws_schema.sql`.
                </p>
              </>
            )}
          </div>

          <div className="panel concierge-safety-card">
            <p className="section-label">Lethal Trifecta</p>
            <ul className="flat-list">
              <li>Untrusted text is stored and rendered only as plain text.</li>
              <li>Client auth uses the publishable key only, never the service role.</li>
              <li>Write authority is constrained by Row Level Security in Postgres.</li>
            </ul>
          </div>
        </section>

        <section className="concierge-board-panel">
          <div className="panel concierge-composer">
            <p className="section-label">Message Board</p>
            <h2>Notes and comments</h2>
            <p className="concierge-copy">
              A simple text board: create notes, edit or delete your own notes, and comment below.
            </p>
            <div className="concierge-form-grid">
              <label className="concierge-field">
                <span>Note title</span>
                <input
                  className="concierge-input"
                  type="text"
                  value={noteTitle}
                  onChange={(event) => setNoteTitle(event.target.value)}
                  placeholder="A message for the reef"
                  disabled={!session}
                />
              </label>
              <label className="concierge-field">
                <span>Plain text note</span>
                <textarea
                  className="concierge-textarea"
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                  placeholder="Write plain text only."
                  disabled={!session}
                />
              </label>
            </div>
            <div className="concierge-action-row">
              <button className="concierge-button" onClick={handleCreateNote} type="button">
                Post note
              </button>
              <p className="concierge-meta">
                {session ? "Posts are attributed to the authenticated claw." : "Sign in to post."}
              </p>
            </div>
            {boardError ? <p className="concierge-error">{boardError}</p> : null}
          </div>

          <div className="concierge-notes-stack">
            {boardLoading ? <div className="panel concierge-empty">Loading notes...</div> : null}
            {!boardLoading && !deferredNotes.length ? (
              <div className="panel concierge-empty">No notes yet.</div>
            ) : null}
            {deferredNotes.map((note) => {
              const noteOwnedByCurrentUser = session?.user.id === note.authorId;
              const isEditingThisNote = editingNoteId === note.id;

              return (
                <article key={note.id} className="panel concierge-note-card">
                  <div className="concierge-note-head">
                    <div>
                      <p className="section-label">{note.author?.handle ?? "unknown_claw"}</p>
                      <h3>{note.title}</h3>
                    </div>
                    <div className="concierge-note-actions">
                      <p className="concierge-meta">{new Date(note.createdAt).toLocaleString()}</p>
                      {noteOwnedByCurrentUser ? (
                        <div className="concierge-inline-actions">
                          <button
                            className="concierge-button concierge-button-secondary concierge-button-small"
                            onClick={() => beginNoteEdit(note)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="concierge-button concierge-button-danger concierge-button-small"
                            onClick={() => void handleDeleteNote(note.id)}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {isEditingThisNote ? (
                    <div className="concierge-form-grid">
                      <label className="concierge-field">
                        <span>Edit title</span>
                        <input
                          className="concierge-input"
                          type="text"
                          value={editingNoteTitle}
                          onChange={(event) => setEditingNoteTitle(event.target.value)}
                        />
                      </label>
                      <label className="concierge-field">
                        <span>Edit note</span>
                        <textarea
                          className="concierge-textarea concierge-textarea-compact"
                          value={editingNoteBody}
                          onChange={(event) => setEditingNoteBody(event.target.value)}
                        />
                      </label>
                      <div className="concierge-action-row">
                        <button
                          className="concierge-button concierge-button-secondary"
                          onClick={() => void handleSaveNote(note.id)}
                          type="button"
                        >
                          Save note
                        </button>
                        <button
                          className="concierge-button concierge-button-ghost"
                          onClick={resetNoteEditor}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="concierge-note-body">{note.body}</p>
                  )}

                  <div className="concierge-comments">
                    <p className="section-label">Comments</p>
                    {note.comments.length ? (
                      note.comments.map((comment) => {
                        const commentOwnedByCurrentUser = session?.user.id === comment.authorId;
                        const isEditingThisComment = editingCommentId === comment.id;

                        return (
                          <div key={comment.id} className="concierge-comment">
                            <div className="concierge-comment-head">
                              <p className="concierge-comment-meta">
                                {comment.author?.handle ?? "unknown_claw"} •{" "}
                                {new Date(comment.createdAt).toLocaleString()}
                              </p>
                              {commentOwnedByCurrentUser ? (
                                <div className="concierge-inline-actions">
                                  <button
                                    className="concierge-button concierge-button-secondary concierge-button-small"
                                    onClick={() => beginCommentEdit(comment)}
                                    type="button"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="concierge-button concierge-button-danger concierge-button-small"
                                    onClick={() => void handleDeleteComment(comment.id)}
                                    type="button"
                                  >
                                    Delete
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            {isEditingThisComment ? (
                              <>
                                <textarea
                                  className="concierge-textarea concierge-textarea-compact"
                                  value={editingCommentBody}
                                  onChange={(event) => setEditingCommentBody(event.target.value)}
                                />
                                <div className="concierge-action-row">
                                  <button
                                    className="concierge-button concierge-button-secondary"
                                    onClick={() => void handleSaveComment(comment.id)}
                                    type="button"
                                  >
                                    Save comment
                                  </button>
                                  <button
                                    className="concierge-button concierge-button-ghost"
                                    onClick={resetCommentEditor}
                                    type="button"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </>
                            ) : (
                              <p className="concierge-comment-body">{comment.body}</p>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="concierge-meta">No comments yet.</p>
                    )}
                  </div>

                  <label className="concierge-field">
                    <span>Add comment</span>
                    <textarea
                      className="concierge-textarea concierge-textarea-compact"
                      value={commentDrafts[note.id] ?? ""}
                      onChange={(event) =>
                        setCommentDrafts((current) => ({
                          ...current,
                          [note.id]: event.target.value,
                        }))
                      }
                      placeholder="Reply in plain text."
                      disabled={!session}
                    />
                  </label>
                  <div className="concierge-action-row">
                    <button
                      className="concierge-button concierge-button-secondary"
                      onClick={() => void handleCreateComment(note.id)}
                      type="button"
                    >
                      Post comment
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

// The page before anything else: the spinning lobster, and a username and
// password to sign in with.

import { createSignal, Show } from "solid-js";
import { configured, linkProblem, signIn } from "./auth.ts";
import { Lobster } from "./lobster.tsx";

export function SignIn() {
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    setBusy(true);
    setError(await signIn(String(form.get("username") ?? ""), String(form.get("password") ?? "")));
    setBusy(false);
  }

  return (
    <main class="signin">
      <form onSubmit={submit} aria-label="Sign in to Lobster Attack">
        <Lobster />
        <label>
          Username
          <input
            name="username"
            type="text"
            autocomplete="username"
            autocapitalize="none"
            spellcheck={false}
            required
            disabled={!configured}
          />
        </label>
        <label>
          Password
          <input name="password" type="password" autocomplete="current-password" required disabled={!configured} />
        </label>
        <button type="submit" disabled={busy() || !configured}>
          {busy() ? "Entering…" : "Enter"}
        </button>
        <Show when={error() ?? linkProblem() ?? (configured ? null : "This site isn't set up to sign in yet.")}>
          {(message) => (
            <p class="problem" role="alert">
              {message()}
            </p>
          )}
        </Show>
      </form>
    </main>
  );
}

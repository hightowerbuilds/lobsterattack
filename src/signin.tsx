// The page before anything else: sign in with the username and password the
// site's owner gave you.

import { createSignal, Show } from "solid-js";
import { configured, signIn } from "./auth.ts";

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
      <form onSubmit={submit} aria-describedby="signin-about">
        <h1>
          tiny-axe <span>know-how</span>
        </h1>
        <p id="signin-about" class="about">
          What tiny-axe has learned, and every chat with it. Sign in with the account you were given.
        </p>
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
          {busy() ? "Signing in…" : "Sign in"}
        </button>
        <Show when={error() ?? (configured ? null : "This site isn't set up to sign in yet.")}>
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

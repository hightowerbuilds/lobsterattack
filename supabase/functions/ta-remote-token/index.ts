import { remoteAgent, remoteTopic } from "../_shared/agents.ts";
// tiny-axe's agent key → a Supabase session of its owner, for joining the
// owner's private Realtime channel (`remote:<owner_id>`).
//
// The project signs sessions with an ES256 key we never hold, so a session
// can't be minted here. Instead Auth's admin API makes a magic-link token for
// the owner (no email is sent) and it's verified on the spot, which starts an
// ordinary session. tiny-axe asks again before `expires_at`; passing the old
// access token as `previous` signs that session out, so they don't pile up.
// No refresh token is handed out.

import { admin, authClient, bearer, body, json, ownerForKey, serve } from "../_shared/remote.ts";

serve(async (req) => {
  const input = await body(req);
  const agent = remoteAgent(input.agent);
  if (!agent) return json(req, 400, { error: "Unknown agent." });
  const owner = await ownerForKey(bearer(req));
  if (!owner) return json(req, 401, { error: "A valid tiny-axe key is needed: Authorization: Bearer <key>" });

  const { data: found, error: userError } = await admin.auth.admin.getUserById(owner);
  if (userError || !found.user?.email) return json(req, 404, { error: "The key's owner has no account." });

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: found.user.email,
  });
  if (linkError) throw new Error(`generateLink: ${linkError.message}`);

  const { data: verified, error: verifyError } = await authClient().auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError || !verified.session) throw new Error(`verifyOtp: ${verifyError?.message ?? "no session"}`);

  const { previous } = input;
  if (typeof previous === "string" && previous) {
    // Best effort: an old session that's already gone is fine.
    await admin.auth.admin.signOut(previous, "local").catch(() => {});
  }

  return json(req, 200, {
    access_token: verified.session.access_token,
    expires_at: verified.session.expires_at,
    owner_id: owner,
    topic: remoteTopic(owner, agent),
    agent,
    protocol: 2,
    // Realtime wants the project's public key in the websocket URL; it's the
    // same one the site's bundle carries.
    apikey: Deno.env.get("SUPABASE_ANON_KEY"),
  });
});

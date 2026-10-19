// BusterClaw polls over HTTPS. Its heartbeat and optional draft are broadcast
// to its own channel; they never appear as Tiny Axe presence or messages.
import { remoteAgent } from "../_shared/agents.ts";
import { admin, bearer, body, CONVERSATION, json, ownerForSession, serve } from "../_shared/remote.ts";

serve(async (req) => {
  const owner = await ownerForSession(bearer(req));
  if (!owner) return json(req, 401, { error: "Sign in first." });
  const input = await body(req);
  const agent = remoteAgent(input.agent);
  if (agent !== "busterclaw") return json(req, 400, { error: "This heartbeat is for BusterClaw." });
  if (input.reply_to != null && (typeof input.reply_to !== "string" || !CONVERSATION.test(input.reply_to))) {
    return json(req, 400, { error: "Invalid message ID." });
  }
  const { data, error } = await admin.rpc("buster_ta_remote_heartbeat", {
    p_owner: owner, p_online: input.online !== false,
    p_message: input.reply_to ?? null,
    p_draft: typeof input.text === "string" ? input.text.slice(0, 20000) : "",
  });
  if (error) throw new Error(error.message);
  return json(req, 200, data);
});

// Claims and replies are atomic in PostgreSQL. A repeated identical reply
// returns its original receipt, including after a lost HTTP response.
import { remoteAgent } from "../_shared/agents.ts";
import { admin, bearer, body, CONVERSATION, json, MAX_BODY, ownerForSession, serve } from "../_shared/remote.ts";

serve(async (req) => {
  const owner = await ownerForSession(bearer(req));
  if (!owner) return json(req, 401, { error: "Sign in first." });
  const input = await body(req);
  const agent = remoteAgent(input.agent);
  if (!agent) return json(req, 400, { error: "Unknown agent." });
  const status = input.status;
  if (typeof input.id !== "string" || !CONVERSATION.test(input.id)) return json(req, 400, { error: "Invalid message ID." });
  if (!["working", "answered", "failed"].includes(String(status))) return json(req, 400, { error: "Invalid status." });
  const text = typeof input.body === "string" ? input.body.trim() : "";
  if (text.length > MAX_BODY || (status === "answered" && !text)) return json(req, 400, { error: "Invalid reply body." });
  const { data, error } = await admin.rpc("buster_ta_remote_reply", {
    p_owner: owner, p_agent: agent, p_id: input.id, p_status: status, p_body: text,
  });
  if (error) throw new Error(error.message);
  return json(req, data.status ?? 200, data);
});

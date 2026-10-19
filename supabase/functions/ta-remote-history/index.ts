import { remoteAgent } from "../_shared/agents.ts";
// The site's Chat tab, when it opens: the latest messages, oldest first.
// `conversation` keeps to one conversation (0012); `before` (a created_at)
// pages further back. The first page also brings the latest approvals (0011),
// without their answers.

import { admin, APPROVAL_COLUMNS, bearer, body, COLUMNS, CONVERSATION, json, ownerForSession, serve } from "../_shared/remote.ts";

serve(async (req) => {
  const owner = await ownerForSession(bearer(req));
  if (!owner) return json(req, 401, { error: "Sign in first." });

  const input = await body(req);
  const agent = remoteAgent(input.agent);
  if (!agent) return json(req, 400, { error: "Unknown agent." });
  const { before, conversation } = input;
  if (conversation !== undefined && (typeof conversation !== "string" || !CONVERSATION.test(conversation))) {
    return json(req, 400, { error: "That isn't a conversation." });
  }
  let query = admin
    .from("buster_ta_remote")
    .select(COLUMNS)
    .eq("owner_id", owner)
    .eq("agent", agent)
    .order("created_at", { ascending: false })
    .limit(100);
  if (typeof before === "string" && before) query = query.lt("created_at", before);
  if (typeof conversation === "string") query = query.eq("conversation", conversation);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let approvals: unknown[] = [];
  if (!before && agent === "tiny-axe") {
    const { data: rows, error: approvalsError } = await admin
      .from("buster_ta_remote_approvals")
      .select(APPROVAL_COLUMNS)
      .eq("owner_id", owner)
      .order("created_at", { ascending: false })
      .limit(50);
    // Before 0011 is applied there's no table: the page just shows no cards.
    if (!approvalsError) approvals = (rows ?? []).reverse();
  }

  const { data: device } = await admin.from("buster_ta_remote_devices")
    .select("last_seen, online").eq("owner_id", owner).eq("agent", agent).maybeSingle();
  const online = device?.online === true && Date.parse(device.last_seen) > Date.now() - 30_000;
  return json(req, 200, { agent, online, messages: (data ?? []).reverse(), approvals });
});

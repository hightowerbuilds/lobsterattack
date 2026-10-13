// The Chat tab → an answer to an approval (tiny-axe docs/plan-chrome-purchases.md, P3).
//
//   { id, decision: "deny" }
//   { id, decision: "approve", proof, total? }
//
// Saved once, only while the approval waits and hasn't expired. This only
// writes: tiny-axe reads the answer back with its key and checks the proof
// (made from the user's approval PIN) and the total itself.

import { admin, APPROVAL_COLUMNS, bearer, body, json, ownerForSession, serve } from "../_shared/remote.ts";

const PROOF = /^[0-9a-f]{64}$/;
const TOTAL = /^[0-9]{1,9}(\.[0-9]{1,2})?$/;

serve(async (req) => {
  const owner = await ownerForSession(bearer(req));
  if (!owner) return json(req, 401, { error: "Sign in first." });

  const input = await body(req);
  const id = String(input.id ?? "");
  const decision = String(input.decision ?? "");
  if (!id) return json(req, 400, { error: "No id." });

  let answer: Record<string, string>;
  if (decision === "deny") {
    answer = { decision };
  } else if (decision === "approve") {
    const proof = String(input.proof ?? "");
    const total = String(input.total ?? "");
    if (!PROOF.test(proof)) return json(req, 400, { error: "Type your approval PIN." });
    if (total && !TOTAL.test(total))
      return json(req, 400, { error: "Type the total as a number, like 16.00." });
    answer = { decision, proof, total };
  } else {
    return json(req, 400, { error: "decision is approve or deny." });
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("buster_ta_remote_approvals")
    .update({ status: "answered", answer, updated_at: now })
    .eq("id", id)
    .eq("owner_id", owner)
    .eq("status", "pending")
    .gt("expires_at", now)
    .select(APPROVAL_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return json(req, 409, { error: "That approval isn't waiting any more." });
  return json(req, 200, { approval: data });
});

// tiny-axe → an approval on the Chat tab (tiny-axe docs/plan-chrome-purchases.md, P3).
// With tiny-axe's site key, never a session: the site login alone can't open
// an approval or read an answer (and its proof) back.
//
//   { action: "open", message_id?, kind, body, nonce, salt, iterations, expires_in }
//   { action: "get", id }                       the approval, with its answer
//   { action: "close", id, outcome }            tiny-axe's word on it

import {
  admin,
  APPROVAL_COLUMNS,
  APPROVAL_KINDS,
  bearer,
  body,
  json,
  OUTCOMES,
  ownerForKey,
  serve,
} from "../_shared/remote.ts";

const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

serve(async (req) => {
  const owner = await ownerForKey(bearer(req));
  if (!owner) return json(req, 401, { error: "Not a tiny-axe key." });

  const input = await body(req);
  const action = String(input.action ?? "");

  if (action === "open") {
    const kind = String(input.kind ?? "");
    const nonce = String(input.nonce ?? "");
    const salt = String(input.salt ?? "");
    const iterations = Number(input.iterations);
    const expiresIn = Number(input.expires_in);
    const shown = input.body;
    if (!APPROVAL_KINDS.has(kind)) return json(req, 400, { error: "Unknown kind." });
    if (!TOKEN.test(nonce) || !TOKEN.test(salt))
      return json(req, 400, { error: "Bad nonce or salt." });
    if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 5000000) {
      return json(req, 400, { error: "Bad iterations." });
    }
    if (!Number.isFinite(expiresIn) || expiresIn < 30 || expiresIn > 900) {
      return json(req, 400, { error: "expires_in is 30 to 900 seconds." });
    }
    if (!shown || typeof shown !== "object" || JSON.stringify(shown).length > 20000) {
      return json(req, 400, { error: "Bad body." });
    }

    let messageId: string | null = null;
    if (typeof input.message_id === "string" && input.message_id) {
      const { data: message, error } = await admin
        .from("buster_ta_remote")
        .select("id")
        .eq("id", input.message_id)
        .eq("owner_id", owner)
        .eq("role", "user")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!message) return json(req, 404, { error: "No such message." });
      messageId = message.id;
    }

    const { data, error } = await admin
      .from("buster_ta_remote_approvals")
      .insert({
        owner_id: owner,
        message_id: messageId,
        kind,
        body: shown,
        nonce,
        salt,
        iterations,
        expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      })
      .select(APPROVAL_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return json(req, 200, { approval: data });
  }

  const id = String(input.id ?? "");
  if (!id) return json(req, 400, { error: "No id." });

  if (action === "get") {
    const { data, error } = await admin
      .from("buster_ta_remote_approvals")
      .select(APPROVAL_COLUMNS + ", answer")
      .eq("id", id)
      .eq("owner_id", owner)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return json(req, 404, { error: "No such approval." });
    return json(req, 200, { approval: data });
  }

  if (action === "close") {
    const outcome = String(input.outcome ?? "");
    if (!OUTCOMES.has(outcome)) return json(req, 400, { error: "Unknown outcome." });
    const { data, error } = await admin
      .from("buster_ta_remote_approvals")
      .update({ status: "closed", outcome, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", owner)
      .neq("status", "closed")
      .select(APPROVAL_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return json(req, 409, { error: "No such open approval." });
    return json(req, 200, { approval: data });
  }

  return json(req, 400, { error: "action is open, get or close." });
});

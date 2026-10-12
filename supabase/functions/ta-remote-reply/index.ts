// tiny-axe → where a message stands, and its finished reply.
//
//   { id, status: "working" }                    taken up: only from pending, so
//                                                when two tiny-axes are online, one
//                                                takes it and the other gets 409
//   { id, status: "answered", body }             the reply (redacted on the machine)
//   { id, status: "failed", body? }              gave up, with why
//
// The pieces streamed while it works go straight out on the channel; only the
// finished reply is kept.

import { admin, bearer, body, COLUMNS, json, MAX_BODY, ownerForSession, serve } from "../_shared/remote.ts";

const STATUSES = new Set(["working", "answered", "failed"]);

serve(async (req) => {
  const owner = await ownerForSession(bearer(req));
  if (!owner) return json(req, 401, { error: "Sign in first." });

  const input = await body(req);
  const id = String(input.id ?? "");
  const status = String(input.status ?? "");
  const text = String(input.body ?? "").trim().slice(0, MAX_BODY);
  if (!STATUSES.has(status)) return json(req, 400, { error: "status is working, answered or failed." });
  if (status === "answered" && !text) return json(req, 400, { error: "An answer needs a body." });

  if (status === "working") {
    // In one statement, so only one taker wins.
    const { data: taken, error } = await admin
      .from("buster_ta_remote")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", owner)
      .eq("role", "user")
      .eq("status", "pending")
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!taken) return json(req, 409, { error: "That message is taken already." });
    return json(req, 200, { message: taken, reply: null });
  }

  const { data: message, error: findError } = await admin
    .from("buster_ta_remote")
    .select("id, status")
    .eq("id", id)
    .eq("owner_id", owner)
    .eq("role", "user")
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (!message) return json(req, 404, { error: "No such message." });
  if (message.status === "answered" || message.status === "failed") {
    return json(req, 409, { error: `That message is already ${message.status}.` });
  }

  let reply = null;
  if (text && status !== "working") {
    const { data, error } = await admin
      .from("buster_ta_remote")
      .insert({ owner_id: owner, role: "assistant", body: text, status, reply_to: id })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    reply = data;
  }

  const { data: updated, error: updateError } = await admin
    .from("buster_ta_remote")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (updateError) throw new Error(updateError.message);

  return json(req, 200, { message: updated, reply });
});

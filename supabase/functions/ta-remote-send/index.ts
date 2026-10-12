// The site → a message for tiny-axe. Kept in buster_ta_remote, so it waits if
// tiny-axe is off; the table's trigger puts it on the owner's channel.

import { admin, bearer, body, COLUMNS, json, MAX_BODY, ownerForSession, serve } from "../_shared/remote.ts";

serve(async (req) => {
  const owner = await ownerForSession(bearer(req));
  if (!owner) return json(req, 401, { error: "Sign in first." });

  const text = String((await body(req)).body ?? "").trim();
  if (!text) return json(req, 400, { error: "The message is empty." });
  if (text.length > MAX_BODY) return json(req, 400, { error: `Messages are at most ${MAX_BODY} characters.` });

  const { data, error } = await admin
    .from("buster_ta_remote")
    .insert({ owner_id: owner, role: "user", body: text })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return json(req, 200, { message: data });
});

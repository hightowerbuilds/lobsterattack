// The site's /remote page, when it opens: the latest messages, oldest first.
// `before` (a created_at) pages further back.

import { admin, bearer, body, COLUMNS, json, ownerForSession, serve } from "../_shared/remote.ts";

serve(async (req) => {
  const owner = await ownerForSession(bearer(req));
  if (!owner) return json(req, 401, { error: "Sign in first." });

  const { before } = await body(req);
  let query = admin
    .from("buster_ta_remote")
    .select(COLUMNS)
    .eq("owner_id", owner)
    .order("created_at", { ascending: false })
    .limit(100);
  if (typeof before === "string" && before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return json(req, 200, { messages: (data ?? []).reverse() });
});

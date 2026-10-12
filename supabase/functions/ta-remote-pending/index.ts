// tiny-axe, on every (re)connect: the messages it hasn't finished, oldest
// first. `working` ones were cut off (tiny-axe stopped mid-answer); tiny-axe
// decides what to do with them rather than running them again blindly.

import { admin, bearer, COLUMNS, json, ownerForSession, serve } from "../_shared/remote.ts";

serve(async (req) => {
  const owner = await ownerForSession(bearer(req));
  if (!owner) return json(req, 401, { error: "Sign in first." });

  const { data, error } = await admin
    .from("buster_ta_remote")
    .select(COLUMNS)
    .eq("owner_id", owner)
    .eq("role", "user")
    .in("status", ["pending", "working"])
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) throw new Error(error.message);
  return json(req, 200, { messages: data });
});

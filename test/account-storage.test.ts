import { expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAccounts } from "../api/_lib/supabaseAccounts.ts";

test("account rollback reports a database error instead of silently succeeding", async () => {
  const client = { auth: { admin: { deleteUser: async () => ({ error: { message: "delete failed" } }) } } } as unknown as SupabaseClient;
  await expect(supabaseAccounts(client).remove("new-account")).rejects.toThrow("delete failed");
});

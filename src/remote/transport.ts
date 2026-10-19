import { supabase } from "../auth.ts";
import type { Approval, Message } from "./types.ts";

type Replies = {
  "ta-remote-history": { messages: Message[]; approvals: Approval[]; online: boolean };
  "ta-remote-send": { message: Message };
  "ta-remote-approve": { approval: Approval };
};

export async function call<K extends keyof Replies>(fn: K, body: Record<string, unknown>): Promise<Replies[K]> {
  if (!supabase) throw new Error("This site isn't set up to sign in yet.");
  const { data, error } = await supabase.functions.invoke<Replies[K]>(fn, { body });
  if (!error && data) return data;
  // Prefer the edge function's explanation; offline failures have no response.
  const response = (error as { context?: Response } | null)?.context;
  const reason = await response?.json?.().catch(() => null);
  throw new Error(reason?.error ?? error?.message ?? "The server returned an empty response.");
}

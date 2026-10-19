import type { Agent } from "../navigation.ts";

export type Message = {
  id: string;
  agent?: Agent;
  role: "user" | "assistant";
  body: string;
  status: "pending" | "working" | "answered" | "failed";
  reply_to: string | null;
  /** Null for messages from before conversations. */
  conversation: string | null;
  created_at: string;
  updated_at: string;
};

export type Live = { text?: string; status?: string };

type ApprovalBody = {
  title: string;
  lines?: string[];
  checks?: { ok: boolean; text: string }[];
  // A purchase: the total to type, and how it's shown.
  total?: string;
  total_text?: string;
};

export type Approval = {
  id: string;
  message_id: string | null;
  kind: "purchase" | "tool" | "model" | "command";
  body: ApprovalBody;
  nonce: string;
  salt: string;
  iterations: number;
  status: "pending" | "answered" | "closed";
  decision?: string | null;
  outcome: string | null;
  created_at: string;
  expires_at: string;
  updated_at: string;
};

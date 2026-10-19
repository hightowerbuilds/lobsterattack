import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import type { Approval } from "./types.ts";
import { proofFor } from "./approval-proof.ts";
import { call } from "./transport.ts";

const OUTCOMES: Record<string, string> = {
  approved: "Approved: tiny-axe went ahead.",
  denied: "Denied: tiny-axe didn't do it.",
  wrong_pin: "Wrong PIN: tiny-axe didn't do it.",
  expired: "Expired: tiny-axe didn't do it.",
  withdrawn: "No longer needed.",
  refused: "tiny-axe refused it (see its reply).",
};

export function ApprovalCard(props: { approval: Approval; onUpdate: (a: Approval) => void }) {
  const a = () => props.approval;
  const [pin, setPin] = createSignal("");
  const [total, setTotal] = createSignal("");
  const [busy, setBusy] = createSignal<"approve" | "deny" | null>(null);
  const [problem, setProblem] = createSignal<string | null>(null);
  const [expired, setExpired] = createSignal(false);
  let disposed = false;
  onCleanup(() => { disposed = true; });
  createEffect(() => {
    const remaining = Date.parse(a().expires_at) - Date.now();
    setExpired(remaining <= 0);
    if (a().status !== "pending" || remaining <= 0) return;
    const timer = setTimeout(() => setExpired(true), remaining);
    onCleanup(() => clearTimeout(timer));
  });
  const open = () => a().status === "pending" && !expired();
  const purchase = () => a().kind === "purchase";

  const answer = async (decision: "approve" | "deny") => {
    if (busy() || !open()) return;
    setProblem(null);
    if (decision === "approve") {
      if (pin().length < 6) return setProblem("Type your approval PIN (set with /remote pin in tiny-axe).");
      if (purchase() && !total().trim()) return setProblem(`Type the total, ${a().body.total ?? ""}, to buy.`);
    }
    setBusy(decision);
    try {
      const body: Record<string, unknown> = { id: a().id, decision };
      if (decision === "approve") {
        const typed = purchase() ? total().trim() : "";
        body.total = typed;
        body.proof = await proofFor(a(), pin(), typed);
      }
      const { approval } = await call("ta-remote-approve", body);
      // The answer is in; the PIN goes.
      setPin("");
      if (!disposed) props.onUpdate({ ...approval, decision });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const state = () => {
    if (a().status === "closed") return OUTCOMES[a().outcome ?? ""] ?? "Closed.";
    if (a().status === "answered") return a().decision === "deny" ? "Denied; telling tiny-axe…" : "Sent; tiny-axe is checking it…";
    if (expired()) return OUTCOMES.expired;
    return null;
  };

  return (
    <li class="message approval" classList={{ purchase: purchase(), done: !open() }}>
      <div class="who">{purchase() ? "tiny-axe wants to buy" : "tiny-axe asks"}</div>
      <div class="approval-title">{a().body.title}</div>
      <For each={a().body.lines ?? []}>{(line) => <div class="approval-line">{line}</div>}</For>
      <Show when={(a().body.checks ?? []).length > 0}>
        <ul class="approval-checks">
          <For each={a().body.checks}>{(c) => <li classList={{ ok: c.ok, failed: !c.ok }}>{c.ok ? "✓" : "✗"} {c.text}</li>}</For>
        </ul>
      </Show>
      <Show when={open()} fallback={<div class="note">{state()}</div>}>
        <form
          class="approval-form"
          onSubmit={(e) => {
            e.preventDefault();
            answer("approve");
          }}
        >
          <Show when={purchase()}>
            <label>
              Type the total{a().body.total_text ? ` (${a().body.total_text})` : ""}
              <input inputmode="decimal" autocomplete="off" value={total()} onInput={(e) => setTotal(e.currentTarget.value)} />
            </label>
          </Show>
          <label>
            Approval PIN
            <input type="password" autocomplete="off" value={pin()} onInput={(e) => setPin(e.currentTarget.value)} />
          </label>
          <div class="approval-buttons">
            <button type="submit" class="button approve" disabled={busy() !== null}>
              {busy() === "approve" ? "Checking…" : purchase() ? "Buy" : "Approve"}
            </button>
            <button type="button" class="button" disabled={busy() !== null} onClick={() => answer("deny")}>
              {busy() === "deny" ? "Denying…" : "Deny"}
            </button>
          </div>
          <div class="note">
            Waits until {new Date(a().expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}; then it's a no.
          </div>
        </form>
      </Show>
      <Show when={problem()}>{(p) => <div class="note problem-note">{p()}</div>}</Show>
    </li>
  );
}

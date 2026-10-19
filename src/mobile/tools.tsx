import { Show } from "solid-js";
import type { createMobileChat } from "../mobile-chat.tsx";

type Controls = ReturnType<typeof createMobileChat>;
export function MobileChatTools(props: { controls: Controls; canRead: boolean; sending: boolean }) {
  const c = props.controls;
  return (
    <Show when={c.mobile()}>
      <div class="mobile-tools">
        <Show when={c.browserBars()}>
          <details class="mobile-help">
            <summary>Hide Safari’s bars on iPhone</summary>
            <p>In Safari, tap Share → Add to Home Screen. Leave Open as Web App on if shown, then launch its icon.</p>
          </details>
        </Show>
        <div class="mobile-actions" role="group" aria-label="Mobile chat controls">
          <Show when={c.expanded()} fallback={
            <button type="button" class="expand-chat" onClick={c.expand} aria-label="Expand chat and keep screen awake"><ToolIcon kind="expand" />Full screen</button>
          }>
            <button type="button" classList={{ "is-awake": c.awake() === "awake" }} onClick={c.retryWake} disabled={c.awake() === "awake" || c.awake() === "requesting"} aria-label={c.awake() === "awake" ? "Screen awake" : "Retry keeping screen awake"}>
              <ToolIcon kind="screen" />{c.awake() === "awake" ? "Awake" : c.awake() === "requesting" ? "Waking…" : "Retry awake"}
            </button>
          </Show>
          <button type="button" onClick={c.microphone} disabled={props.sending} aria-label={c.listening() ? "Stop microphone" : "Start microphone"} aria-pressed={c.listening()}>
            <ToolIcon kind={c.listening() ? "stop" : "mic"} />{c.listening() ? "Finish" : "Microphone"}
          </button>
          <button type="button" onClick={c.readReply} disabled={!props.canRead && !c.reading()} aria-label={c.reading() ? "Stop reading" : "Read latest reply aloud"} aria-pressed={c.reading()}>
            <ToolIcon kind={c.reading() ? "stop" : "speaker"} />{c.reading() ? "Stop reading" : "Read reply"}
          </button>
        </div>
        <Show when={c.expanded() && c.awake() === "unavailable"}>
          <p class="mobile-notice" role="status">Screen awake is unavailable. Your phone may lock; try turning off Low Power Mode, then retry.</p>
        </Show>
        <Show when={c.notice()}><p class="mobile-notice" role="status">{c.notice()}</p></Show>
      </div>
    </Show>
  );
}

function ToolIcon(props: { kind: "expand" | "screen" | "mic" | "speaker" | "stop" }) {
  const paths = {
    expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
    screen: "M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 15h2",
    mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-3 6v1a6 6 0 0 0 12 0v-1m-6 7v4m-3 0h6",
    speaker: "M11 4 6 8H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14",
    stop: "M6 6h12v12H6V6Z",
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[props.kind]} /></svg>;
}

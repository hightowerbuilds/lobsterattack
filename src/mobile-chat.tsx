import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import { renderChat } from "../api/_lib/chats/render.ts";
import { screenAwake, type AwakeState } from "./screen-awake.ts";

// Safari exposes the prefixed recognition constructor; TypeScript's DOM
// library does not yet include either version of this optional API.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function createMobileChat(props: {
  box: () => HTMLDivElement | undefined;
  input: () => HTMLTextAreaElement | undefined;
  scope: () => string;
  text: () => string;
  setText: (text: string) => void;
  reply: () => string;
  sending: () => boolean;
}) {
  const [mobile, setMobile] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  const [awake, setAwake] = createSignal<AwakeState>("off");
  const [listening, setListening] = createSignal(false);
  const [reading, setReading] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const [browserBars, setBrowserBars] = createSignal(false);
  const speechWindow = window as SpeechWindow;
  const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  const wake = screenAwake(navigator.wakeLock ? () => navigator.wakeLock.request("screen") : undefined, setAwake);
  let recognition: Recognition | undefined;
  let utterance: SpeechSynthesisUtterance | undefined;
  let readGeneration = 0;
  let nativeFullscreen = false;
  let disposed = false;
  let returnFocus: HTMLElement | null = null;

  const stopMic = () => {
    const previous = recognition;
    recognition = undefined;
    setListening(false);
    if (previous) {
      previous.onresult = previous.onerror = previous.onend = null;
      try { previous.abort(); } catch { /* Already stopped. */ }
    }
  };
  const stopReading = () => {
    readGeneration++;
    if (utterance) {
      utterance.onend = utterance.onerror = null;
      utterance = undefined;
      synth?.cancel();
    }
    setReading(false);
  };
  const stopAudio = () => { stopMic(); stopReading(); setNotice(""); };
  const close = (restoreFocus = true) => {
    setExpanded(false);
    setBrowserBars(false);
    wake.stop();
    stopAudio();
    if (document.fullscreenElement === props.box()) void document.exitFullscreen().catch(() => {});
    nativeFullscreen = false;
    if (restoreFocus) queueMicrotask(() => {
      const button = props.box()?.querySelector<HTMLButtonElement>(".expand-chat");
      (returnFocus?.isConnected ? returnFocus : button)?.focus({ preventScroll: true });
    });
  };
  const expand = () => {
    if (!mobile()) return;
    returnFocus = document.activeElement as HTMLElement | null;
    setExpanded(true);
    setNotice("");
    wake.start();
    const standalone = matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setBrowserBars(!standalone);
    const box = props.box();
    // iPhone has no element fullscreen API. The same expanded layout works
    // there, and in Home Screen apps, without pretending Safari bars vanished.
    if (!standalone && box?.requestFullscreen && document.fullscreenEnabled) {
      void box.requestFullscreen().then(() => {
        if (disposed || !expanded()) {
          if (document.fullscreenElement === box) void document.exitFullscreen().catch(() => {});
          return;
        }
        nativeFullscreen = true;
        setBrowserBars(false);
      }).catch(() => { /* Keep the expanded layout and Home Screen tip. */ });
    }
    queueMicrotask(() => props.box()?.querySelector<HTMLButtonElement>(".close-expanded")?.focus({ preventScroll: true }));
  };

  const microphone = () => {
    if (!mobile() || props.sending()) return;
    if (recognition) {
      try { recognition.stop(); } catch { stopMic(); }
      return;
    }
    stopReading();
    setNotice("");
    if (!Recognition) {
      setNotice("Use the microphone on your iPhone keyboard to dictate into the message box.");
      props.input()?.focus();
      return;
    }
    const next = new Recognition();
    recognition = next;
    next.lang = navigator.language || "en-US";
    next.continuous = false;
    next.interimResults = true;
    const before = props.text().trimEnd();
    let finalText = "";
    next.onresult = (event) => {
      if (recognition !== next) return;
      const results = Array.from(event.results);
      finalText = results.filter(result => result.isFinal).map(result => result[0].transcript).join(" ").trim();
      const interim = results.filter(result => !result.isFinal).map(result => result[0].transcript).join(" ").trim();
      props.setText([before, finalText].filter(Boolean).join(" ").slice(0, 20000));
      setNotice(interim ? `Hearing: ${interim}` : "Dictation added. Review your message, then tap Send.");
    };
    next.onerror = ({ error }) => {
      if (recognition !== next) return;
      stopMic();
      const errors: Record<string, string> = {
        "not-allowed": "Microphone access was denied. Allow it in Safari’s website settings, or use your keyboard’s microphone.",
        "service-not-allowed": "Voice dictation is unavailable here. Try Safari or your keyboard’s microphone.",
        "audio-capture": "Your microphone is unavailable. Check that another app isn’t using it.",
        "no-speech": "No speech heard. Tap the microphone to try again.",
        network: "Dictation couldn’t connect. Check your connection or use your keyboard’s microphone.",
      };
      setNotice(errors[error] ?? "Dictation stopped. Try again or use your keyboard’s microphone.");
    };
    next.onend = () => {
      if (recognition !== next) return;
      recognition = undefined;
      setListening(false);
      setNotice(finalText ? "Dictation added. Review your message, then tap Send." : "No speech added. Tap the microphone to try again.");
    };
    try {
      next.start();
      setListening(true);
      setNotice("Listening… Tap the microphone again to finish.");
    } catch {
      stopMic();
      setNotice("Dictation couldn’t start. Try Safari or your keyboard’s microphone.");
    }
  };

  const readReply = () => {
    if (!mobile()) return;
    if (reading()) { stopReading(); return; }
    stopMic();
    setNotice("");
    if (!synth || !window.SpeechSynthesisUtterance) {
      setNotice("Read aloud isn’t available in this browser. Try opening this site in Safari.");
      return;
    }
    // Use the safe Markdown renderer and DOM text, so formatting and links
    // sound like prose. Short chunks avoid truncating long replies.
    const template = document.createElement("template");
    template.innerHTML = renderChat(props.reply());
    template.content.querySelectorAll("p, li, h1, h2, h3, pre, tr, br").forEach(el => el.append("\n"));
    const prose = (template.content.textContent ?? "").replace(/\s+/g, " ").trim();
    const chunks = prose.match(/.{1,220}(?:\s|$)|\S{1,220}/gu) ?? [];
    if (!chunks.length) return;
    const generation = ++readGeneration;
    const speak = (index: number) => {
      if (disposed || generation !== readGeneration) return;
      if (index >= chunks.length) { utterance = undefined; setReading(false); return; }
      const next = new SpeechSynthesisUtterance(chunks[index].trim());
      utterance = next; // Keep a strong reference until Safari finishes.
      next.lang = navigator.language || "en-US";
      next.onend = () => speak(index + 1);
      next.onerror = () => {
        if (generation !== readGeneration) return;
        stopReading();
        setNotice("Reading stopped. Tap Read reply to try again.");
      };
      try { synth.speak(next); }
      catch { next.onerror?.(new Event("error") as SpeechSynthesisErrorEvent); }
    };
    synth.cancel();
    setReading(true);
    speak(0); // The first utterance starts within the user's tap on iOS.
  };

  createEffect(on(props.scope, stopAudio, { defer: true }));
  createEffect(() => { if (props.sending()) stopAudio(); });
  createEffect(() => { document.documentElement.classList.toggle("chat-is-expanded", expanded()); });

  onMount(() => {
    const media = matchMedia("(hover: none) and (pointer: coarse)");
    const deviceChanged = () => {
      setMobile(media.matches);
      if (!media.matches) close(false);
    };
    const viewport = window.visualViewport;
    const resize = () => {
      // iOS's keyboard resizes the visual viewport, not the layout viewport.
      // Preserve pinch zoom; only fit the composer when at the normal scale.
      if (!mobile() || (viewport && viewport.scale > 1.05)) return;
      document.documentElement.style.setProperty("--mobile-height", `${viewport?.height ?? innerHeight}px`);
      props.box()?.style.setProperty("--chat-top", `${viewport?.offsetTop ?? 0}px`);
    };
    const visibility = () => {
      const visible = document.visibilityState === "visible";
      if (!visible) stopAudio();
      wake.visibility(visible);
    };
    const fullscreen = () => {
      if (nativeFullscreen && document.fullscreenElement !== props.box()) close();
    };
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape" && expanded()) close(); };
    const pagehide = () => { stopAudio(); wake.visibility(false); };
    deviceChanged();
    resize();
    media.addEventListener("change", deviceChanged);
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("pageshow", visibility);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("fullscreenchange", fullscreen);
    document.addEventListener("keydown", keydown);
    onCleanup(() => {
      disposed = true;
      close(false);
      media.removeEventListener("change", deviceChanged);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", visibility);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("fullscreenchange", fullscreen);
      document.removeEventListener("keydown", keydown);
      document.documentElement.classList.remove("chat-is-expanded");
      document.documentElement.style.removeProperty("--mobile-height");
    });
  });

  return { mobile, expanded, awake, listening, reading, notice, browserBars, expand, close, microphone, readReply,
    retryWake: () => wake.start(), stopAudio };
}

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

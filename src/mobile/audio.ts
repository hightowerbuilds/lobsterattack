import { createSignal, onCleanup } from "solid-js";
import { renderChat } from "../../api/_lib/chats/render.ts";

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

export function createAudio(props: {
  mobile: () => boolean;
  sending: () => boolean;
  input: () => HTMLTextAreaElement | undefined;
  text: () => string;
  setText: (text: string) => void;
  reply: () => string;
}) {
  const [listening, setListening] = createSignal(false);
  const [reading, setReading] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const speechWindow = window as SpeechWindow;
  const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  let recognition: Recognition | undefined;
  let utterance: SpeechSynthesisUtterance | undefined;
  let readGeneration = 0;
  let disposed = false;
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
  const microphone = () => {
    if (!props.mobile() || props.sending()) return;
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
    if (!props.mobile()) return;
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
    template.content.querySelectorAll(".visual-card").forEach(el => {
      el.replaceWith(document.createTextNode(`Drawing: ${el.getAttribute("aria-label") ?? "Agent drawing"}. `));
    });
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

  onCleanup(() => { disposed = true; stopAudio(); });
  return { listening, reading, notice, microphone, readReply, stopAudio };
}

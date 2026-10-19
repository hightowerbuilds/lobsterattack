import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { screenAwake, type AwakeState } from "../screen-awake.ts";

export function createExpandedChat(props: { box: () => HTMLDivElement | undefined; stopAudio: () => void }) {
  const [mobile, setMobile] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  const [awake, setAwake] = createSignal<AwakeState>("off");
  const [browserBars, setBrowserBars] = createSignal(false);
  const wake = screenAwake(navigator.wakeLock ? () => navigator.wakeLock.request("screen") : undefined, setAwake);
  let nativeFullscreen = false;
  let disposed = false;
  let returnFocus: HTMLElement | null = null;
  createEffect(() => { document.documentElement.classList.toggle("chat-is-expanded", expanded()); });
  const close = (restoreFocus = true) => {
    setExpanded(false);
    setBrowserBars(false);
    wake.stop();
    props.stopAudio();
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
    props.stopAudio();
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
      if (!visible) props.stopAudio();
      wake.visibility(visible);
    };
    const fullscreen = () => {
      if (nativeFullscreen && document.fullscreenElement !== props.box()) close();
    };
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape" && expanded() && !document.querySelector("dialog[open]")) close(); };
    const pagehide = () => { props.stopAudio(); wake.visibility(false); };
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

  return { mobile, expanded, awake, browserBars, expand, close, retryWake: () => wake.start() };
}

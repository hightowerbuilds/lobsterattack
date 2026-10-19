import { createSignal, onCleanup, Show } from "solid-js";

// Only the renderer's image buttons can open this viewer. The drawing stays
// inside an <img>, including at full size; it is never a live SVG document.
export function createVisualViewer() {
  const [image, setImage] = createSignal<{ src: string; title: string } | null>(null);
  const [zoomed, setZoomed] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  let dialog!: HTMLDialogElement;
  let trigger: HTMLButtonElement | null = null;
  const close = () => dialog?.close();
  const openFromClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button.visual-preview[data-visual-src]");
    const src = button?.dataset.visualSrc;
    if (!button || !src?.startsWith("data:image/svg+xml;charset=utf-8,")) return;
    event.preventDefault();
    trigger = button;
    setZoomed(false);
    setFailed(false);
    setImage({ src, title: button.dataset.visualTitle || "Agent drawing" });
    dialog.showModal();
  };
  onCleanup(close);
  const Viewer = () => (
    <dialog
      ref={el => { dialog = el; }}
      class="visual-viewer"
      aria-label={image()?.title ?? "Full image"}
      onClose={() => { setImage(null); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); }}
    >
      <header class="visual-viewer-head">
        <strong>{image()?.title}</strong>
        <button type="button" onClick={() => setZoomed(!zoomed())} disabled={failed()} aria-pressed={zoomed()}>{zoomed() ? "Fit image" : "Actual size"}</button>
        <button type="button" class="visual-viewer-close" aria-label="Close image" autofocus onClick={close}>✕</button>
      </header>
      <div class="visual-stage" classList={{ "visual-zoomed": zoomed() }} tabindex="0" aria-label="Image view; scroll to pan at actual size">
        <Show when={image()}>{(current) => (
          <Show when={!failed()} fallback={<p role="status">This drawing could not be loaded. Close it and ask the agent to redraw it.</p>}>
            <img src={current().src} alt={current().title} onError={() => setFailed(true)} />
          </Show>
        )}</Show>
      </div>
    </dialog>
  );
  return { openFromClick, close, Viewer };
}

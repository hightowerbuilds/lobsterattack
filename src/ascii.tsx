// Cache each generated frame once. Static send marks generate just one;
// the sign-in lobster generates further frames only while visible.
import { createSignal, For, onCleanup, onMount } from "solid-js";

type Run = { text: string; colour: string | null };
export type Frame = Run[][];

export function runs(cells: Iterable<[string, string | null]>): Run[] {
  const out: Run[] = [];
  for (const [ch, colour] of cells) {
    const last = out.at(-1);
    if (last && last.colour === colour) last.text += ch;
    else out.push({ text: ch, colour });
  }
  return out;
}

const frames = new WeakMap<(index: number) => Frame, Frame[]>();

export function AsciiArt(props: {
  make: (index: number) => Frame;
  count?: number;
  frameMs?: number;
  label: string;
  class: string;
}) {
  const [shown, setShown] = createSignal<Frame>([]);
  onMount(() => {
    const cached = frames.get(props.make) ?? [];
    frames.set(props.make, cached);
    const show = (index: number) => setShown(cached[index] ??= props.make(index));
    show(0);
    const count = props.count ?? 1;
    if (count === 1) return;

    let timer: ReturnType<typeof setInterval> | undefined;
    let index = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      clearInterval(timer);
      if (reduced.matches) { show(0); return; }
      if (document.visibilityState !== "visible") return;
      timer = setInterval(() => show(index = (index + 1) % count), props.frameMs);
    };
    document.addEventListener("visibilitychange", update);
    reduced.addEventListener("change", update);
    update();
    onCleanup(() => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      reduced.removeEventListener("change", update);
    });
  });

  return (
    <div class={props.class} aria-label={props.label} role="img">
      <pre aria-hidden="true">
        <For each={shown()}>{row => <>
          <For each={row}>{run => <span style={run.colour ? { color: run.colour } : undefined}>{run.text}</span>}</For>
          {"\n"}
        </>}</For>
      </pre>
    </div>
  );
}

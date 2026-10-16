// What the ASCII marks (the axe, the B, the lobster) share: frames of
// coloured characters, worked out a few at a time while the browser is idle
// (once per page), then cycled. With reduced motion the first frame stands.

import { createSignal, For, onCleanup, onMount, type JSX } from "solid-js";

/** A run of same-coloured characters on a row. */
export type Run = { text: string; colour: string | null };
export type Frame = Run[][];

/** A row of cells as runs of the same colour. */
export function runs(cells: Iterable<[string, string | null]>): Run[] {
  const out: Run[] = [];
  for (const [ch, colour] of cells) {
    const last = out[out.length - 1];
    if (last && last.colour === colour) last.text += ch;
    else out.push({ text: ch, colour });
  }
  return out;
}

type Making = { first: Promise<Frame>; all: Promise<Frame[]> };
const made = new Map<(i: number) => Frame, Making>();

// Every frame, a few per idle moment the first time; the first as soon as
// it's made, to stand until the rest are.
function frames(make: (i: number) => Frame, count: number): Making {
  let making = made.get(make);
  if (!making) {
    let first!: (f: Frame) => void;
    const firstMade = new Promise<Frame>((resolve) => (first = resolve));
    const all = new Promise<Frame[]>((resolve) => {
      const done: Frame[] = [];
      const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f) => setTimeout(f, 0));
      const step = () => {
        const until = performance.now() + 12;
        while (done.length < count && performance.now() < until) {
          done.push(make(done.length));
          if (done.length === 1) first(done[0]);
        }
        if (done.length < count) idle(step);
        else resolve(done);
      };
      idle(step);
    });
    making = { first: firstMade, all };
    made.set(make, making);
  }
  return making;
}

export function AsciiArt(props: {
  make: (i: number) => Frame;
  count: number;
  frameMs: number;
  label: string;
  class: string;
  children?: JSX.Element;
}) {
  const [shown, setShown] = createSignal<Frame | null>(null);
  let timer: number | undefined;
  onMount(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const making = frames(props.make, props.count);
    void making.first.then((f) => setShown((now) => now ?? f));
    void making.all.then((all) => {
      let i = 0;
      setShown(all[0]);
      if (still) return;
      timer = window.setInterval(() => setShown(all[(i = (i + 1) % all.length)]), props.frameMs);
    });
  });
  onCleanup(() => clearInterval(timer));

  return (
    <div class={props.class} aria-label={props.label} role="img">
      <pre aria-hidden="true">
        <For each={shown() ?? []}>
          {(row) => (
            <>
              <For each={row}>{(run) => <span style={run.colour ? { color: run.colour } : undefined}>{run.text}</span>}</For>
              {"\n"}
            </>
          )}
        </For>
      </pre>
      {props.children}
    </div>
  );
}

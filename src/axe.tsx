// tiny-axe's welcome axe, as on its TUI: a double-bit axe modelled as a
// signed-distance field, ray-cast cell by cell into ASCII and lit from the
// front left, turning about its handle. The frames are worked out once,
// in the browser, a few per idle moment, and then just cycled.

import { createSignal, For, onCleanup, onMount } from "solid-js";

const COLS = 44;
const ROWS = 13;
const FRAMES = 48;
const FRAME_MS = 70;
const CELL_W = 0.31;
const CELL_H = 0.62;
const NEAR = -4;
const FAR = 4;
const STEP = 0.06;
const RAMP = " .,:;-=+*#%@";

const GREEN: RGB = [126, 211, 115];
const ORANGE: RGB = [245, 163, 78];
const STEEL: RGB = [205, 220, 225];

type RGB = [number, number, number];
type V3 = [number, number, number];
type Part = "head" | "handle";
/** A run of same-coloured characters on a row. */
type Run = { text: string; colour: string | null };

// The axe, in its own space: the handle up the y axis, the head across x.

function head(x: number, y: number, z: number) {
  const ax = Math.abs(x);
  const t = Math.min(ax / 3.9, 1);
  const flare = 0.95 * t * t;
  const top = 2.85 + flare;
  const bottom = 0.95 - flare;
  const thick = 0.08 + 0.34 * (1 - t) * (1 - t);
  const mid = (y - 1.9) / 1.9;
  const dx = ax - (3.9 - 0.6 * mid * mid);
  const dy = Math.max(bottom - y, y - top);
  const dz = Math.abs(z) - thick;
  return Math.max(dx, dy, dz);
}

function handle(x: number, y: number, z: number) {
  const r = Math.hypot(x, z);
  const radius = 0.52 + 0.1 * Math.max(0, -y / 3.4);
  const body = Math.max(r - radius, -3.4 - y, y - 3.2);
  const knob = Math.hypot(x, y + 3.3, z) - 0.7;
  return Math.min(body, knob);
}

function sdf(x: number, y: number, z: number): [number, Part] {
  const h = head(x, y, z);
  const s = handle(x, y, z);
  return h < s ? [h, "head"] : [s, "handle"];
}

// Turning and lighting

type Rot = { spin: number; lean: number };

const rotation = (frame: number): Rot => {
  const spin = (frame * 2 * Math.PI) / FRAMES;
  return { spin, lean: 0.42 + 0.18 * Math.sin(2 * spin) };
};

function toModel([x, y, z]: V3, { spin, lean }: Rot): V3 {
  const cl = Math.cos(lean);
  const sl = Math.sin(lean);
  const y1 = y * cl - z * sl;
  const z1 = y * sl + z * cl;
  const cs = Math.cos(spin);
  const ss = Math.sin(spin);
  return [x * cs - z1 * ss, y1, x * ss + z1 * cs];
}

function distance(p: V3, rot: Rot) {
  const [x, y, z] = toModel(p, rot);
  return sdf(x, y, z);
}

function unit([x, y, z]: V3): V3 {
  const n = Math.hypot(x, y, z);
  return n === 0 ? [0, 0, 1] : [x / n, y / n, z / n];
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function normal([x, y, z]: V3, rot: Rot): V3 {
  const e = 0.02;
  return unit([
    distance([x + e, y, z], rot)[0] - distance([x - e, y, z], rot)[0],
    distance([x, y + e, z], rot)[0] - distance([x, y - e, z], rot)[0],
    distance([x, y, z + e], rot)[0] - distance([x, y, z - e], rot)[0],
  ]);
}

// Light from above, to the left and from behind the viewer.
const LIGHT = unit([-0.5, 0.65, -0.6]);
const HALF = unit([LIGHT[0], LIGHT[1], LIGHT[2] - 1]);

function cast(x: number, y: number, rot: Rot): [V3, Part] | null {
  for (let z = NEAR; z <= FAR; ) {
    const [d, part] = distance([x, y, z], rot);
    if (d < 0.01) return [[x, y, z], part];
    z += Math.max(d * 0.5, STEP);
  }
  return null;
}

function cell(col: number, row: number, rot: Rot): [string, string | null] {
  const x = (col - (COLS - 1) / 2) * CELL_W;
  const y = -(row - (ROWS - 1) / 2) * CELL_H;
  const hit = cast(x, y, rot);
  if (!hit) return [" ", null];
  const [point, part] = hit;
  const n = normal(point, rot);
  const diffuse = Math.max(dot(n, LIGHT), 0);
  const gloss = Math.pow(Math.max(dot(n, HALF), 0), part === "head" ? 24 : 6);
  const edge = part === "head" && Math.abs(toModel(point, rot)[0]) > 3.1;
  const base = part === "head" ? (edge ? GREEN : STEEL) : ORANGE;
  const light = Math.min(part === "head" ? 0.2 + 0.6 * diffuse + 0.7 * gloss : 0.25 + 0.7 * diffuse + 0.3 * gloss, 1);
  const shade = (c: number) => Math.round(c * (0.35 + 0.65 * light));
  return [RAMP[Math.round(light * (RAMP.length - 1))], `rgb(${shade(base[0])},${shade(base[1])},${shade(base[2])})`];
}

function frame(index: number): Run[][] {
  const rot = rotation(index);
  const rows: Run[][] = [];
  for (let row = 0; row < ROWS; row++) {
    const runs: Run[] = [];
    for (let col = 0; col < COLS; col++) {
      const [ch, colour] = cell(col, row, rot);
      const last = runs[runs.length - 1];
      if (last && last.colour === colour) last.text += ch;
      else runs.push({ text: ch, colour });
    }
    rows.push(runs);
  }
  return rows;
}

let frames: Run[][][] | null = null;
let making: Promise<Run[][][]> | null = null;

// All the frames, a few per idle moment the first time.
function allFrames(): Promise<Run[][][]> {
  if (frames) return Promise.resolve(frames);
  making ??= new Promise((resolve) => {
    const made: Run[][][] = [];
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f) => setTimeout(f, 0));
    const step = () => {
      const until = performance.now() + 12;
      while (made.length < FRAMES && performance.now() < until) made.push(frame(made.length));
      if (made.length < FRAMES) idle(step);
      else resolve((frames = made));
    };
    idle(step);
  });
  return making;
}

/** The turning axe, with "tiny-axe" under it. */
export function Axe() {
  const [shown, setShown] = createSignal<Run[][] | null>(null);
  let timer: number | undefined;
  onMount(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    void allFrames().then((all) => {
      let i = 0;
      setShown(all[0]);
      if (still) return;
      timer = window.setInterval(() => setShown(all[(i = (i + 1) % FRAMES)]), FRAME_MS);
    });
  });
  onCleanup(() => clearInterval(timer));

  return (
    <div class="axe" aria-label="tiny-axe" role="img">
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
      <div class="axe-name">
        <span class="g">tiny</span>
        <span class="o">-axe</span>
      </div>
    </div>
  );
}

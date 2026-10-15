// Lobster Attack's mark: a lobster, modelled as a signed-distance field
// (carapace, a tail of shrinking segments curling to its fan, two big claws,
// walking legs, eyes on stalks and long antennae), ray-cast cell by cell into
// ASCII, lit from above, spinning round and round (played by ascii.tsx).

import { AsciiArt, runs, type Frame } from "./ascii.tsx";

const COLS = 64;
const ROWS = 24;
const FRAMES = 72;
const FRAME_MS = 60;
const CELL_W = 0.2;
const CELL_H = 0.36;
const NEAR = -7;
const FAR = 7;
const STEP = 0.05;
/** Nothing of the lobster is further than this from its middle. */
const REACH = 6.2;
const RAMP = " .,:;-=+*#%@";
/** The faintest character a lit surface gets. */
const DENSE = 4;

const SHELL: RGB = [214, 64, 48];
const CLAW: RGB = [232, 98, 52];
const BELLY: RGB = [240, 168, 112];
const EYE: RGB = [40, 30, 30];

type RGB = [number, number, number];
type V3 = [number, number, number];
type Part = "shell" | "claw" | "belly" | "eye";

// Shapes

function ellipsoid(p: V3, c: V3, r: V3) {
  const x = (p[0] - c[0]) / r[0];
  const y = (p[1] - c[1]) / r[1];
  const z = (p[2] - c[2]) / r[2];
  const k0 = Math.hypot(x, y, z);
  const k1 = Math.hypot(x / r[0], y / r[1], z / r[2]);
  return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
}

function capsule(p: V3, a: V3, b: V3, r: number) {
  const ba: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const pa: V3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const h = Math.min(Math.max((pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / (ba[0] ** 2 + ba[1] ** 2 + ba[2] ** 2), 0), 1);
  return Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h) - r;
}

/** A smooth join, so the shell reads as one piece. */
function smin(a: number, b: number, k: number) {
  const h = Math.min(Math.max(0.5 + (0.5 * (b - a)) / k, 0), 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}

// The lobster, in its own space: its back up the y axis, its claws towards
// +x, its tail towards -x, its sides along z. The whole is moved so it turns
// about its middle.

const TAIL = Array.from({ length: 6 }, (_, i) => ({
  c: [-0.9 - i * 0.52, -0.06 * i * i * 0.6, 0] as V3,
  r: [0.38, 0.55 - 0.045 * i, 0.68 - 0.05 * i] as V3,
}));

function lobster(p: V3): [number, Part] {
  // One side's claw, leg and feeler, mirrored: z is taken as its distance from the middle.
  const q: V3 = [p[0], p[1], Math.abs(p[2])];

  // Carapace, head and tail, smoothly joined.
  let shell = ellipsoid(p, [0.55, 0.05, 0], [1.4, 0.72, 0.78]);
  shell = smin(shell, ellipsoid(p, [1.9, 0.12, 0], [0.6, 0.38, 0.42]), 0.25);
  for (const s of TAIL) shell = smin(shell, ellipsoid(p, s.c, s.r), 0.12);

  // The tail fan: a middle lobe and two either side.
  let fan = ellipsoid(p, [-4.25, -0.42, 0], [0.55, 0.12, 0.42]);
  fan = Math.min(fan, ellipsoid([p[0], p[1], q[2]], [-4.15, -0.42, 0.5], [0.48, 0.11, 0.32]));
  shell = Math.min(shell, fan);

  // Eyes on short stalks.
  const eye = Math.min(capsule(q, [1.95, 0.25, 0.14], [2.15, 0.42, 0.26], 0.07), ellipsoid(q, [2.18, 0.45, 0.28], [0.12, 0.12, 0.12]));

  // The big claws: an arm in two parts, then the crusher and its pincers.
  let claw = capsule(q, [1.55, -0.05, 0.5], [2.35, 0.0, 1.2], 0.2);
  claw = smin(claw, capsule(q, [2.35, 0.0, 1.2], [3.15, 0.05, 1.4], 0.24), 0.1);
  claw = smin(claw, ellipsoid(q, [3.95, 0.06, 1.48], [0.85, 0.4, 0.55]), 0.15);
  claw = Math.min(claw, capsule(q, [4.55, 0.06, 1.72], [5.5, 0.08, 1.45], 0.16));
  claw = Math.min(claw, capsule(q, [4.55, 0.06, 1.25], [5.35, 0.08, 1.32], 0.13));

  // Walking legs and long feelers.
  let legs = Infinity;
  for (let k = 0; k < 4; k++) {
    const x = 1.05 - k * 0.42;
    legs = Math.min(legs, capsule(q, [x, -0.25, 0.42], [x - 0.15, -0.55, 1.05], 0.06), capsule(q, [x - 0.15, -0.55, 1.05], [x - 0.35, -0.95, 1.35], 0.05));
  }
  legs = Math.min(legs, capsule(q, [2.2, 0.2, 0.12], [3.6, 0.75, 0.7], 0.06), capsule(q, [3.6, 0.75, 0.7], [5.6, 0.55, 2.3], 0.05));

  let d = shell;
  let part: Part = "shell";
  if (claw < d) [d, part] = [claw, "claw"];
  if (legs < d) [d, part] = [legs, "claw"];
  if (eye < d) [d, part] = [eye, "eye"];
  return [d, part];
}

const MIDDLE = 0.35;

// Turning and lighting

type Rot = { spin: number; lean: number };

const rotation = (frame: number): Rot => ({ spin: (frame * 2 * Math.PI) / FRAMES, lean: 0.78 });

// From the screen's space into the lobster's: lean back to look down on it,
// then turn it.
function toModel([x, y, z]: V3, { spin, lean }: Rot): V3 {
  const cl = Math.cos(lean);
  const sl = Math.sin(lean);
  const y1 = y * cl - z * sl;
  const z1 = y * sl + z * cl;
  const cs = Math.cos(spin);
  const ss = Math.sin(spin);
  return [x * cs - z1 * ss + MIDDLE, y1, x * ss + z1 * cs];
}

const distance = (p: V3, rot: Rot) => lobster(toModel(p, rot));

function unit([x, y, z]: V3): V3 {
  const n = Math.hypot(x, y, z);
  return n === 0 ? [0, 0, -1] : [x / n, y / n, z / n];
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
const LIGHT = unit([-0.45, 0.75, -0.5]);
const HALF = unit([LIGHT[0], LIGHT[1], LIGHT[2] - 1]);

function cast(x: number, y: number, rot: Rot): [V3, Part] | null {
  // A ray that passes wide of the lobster can't hit it.
  if (x * x + y * y > REACH * REACH) return null;
  for (let z = NEAR; z <= FAR; ) {
    const [d, part] = distance([x, y, z], rot);
    if (d < 0.01) return [[x, y, z], part];
    z += Math.max(d * 0.7, STEP);
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
  const gloss = Math.pow(Math.max(dot(n, HALF), 0), part === "eye" ? 30 : 14);
  // The underside, facing away from the light, is paler, as a lobster's is.
  const under = part === "shell" && n[1] * Math.cos(rot.lean) - n[2] * Math.sin(rot.lean) < -0.35;
  const base = part === "eye" ? EYE : part === "claw" ? CLAW : under ? BELLY : SHELL;
  const light = Math.min(0.22 + 0.68 * diffuse + 0.5 * gloss, 1);
  const shade = (c: number) => Math.round(Math.min(c * (0.3 + 0.7 * light) + 90 * gloss, 255));
  // Solid characters even in shadow, so the shell reads as one piece; the
  // light is mostly in the colour.
  return [RAMP[DENSE + Math.round(light * (RAMP.length - 1 - DENSE))], `rgb(${shade(base[0])},${shade(base[1])},${shade(base[2])})`];
}

function frame(index: number): Frame {
  const rot = rotation(index);
  const rows: Frame = [];
  for (let row = 0; row < ROWS; row++) rows.push(runs(Array.from({ length: COLS }, (_, col) => cell(col, row, rot))));
  return rows;
}

/** The spinning lobster. */
export function Lobster() {
  return <AsciiArt make={frame} count={FRAMES} frameMs={FRAME_MS} label="Lobster Attack: a spinning lobster" class="lobster" />;
}

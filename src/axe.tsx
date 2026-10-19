// tiny-axe's mark: a double-bit axe, as real as ASCII allows. A Michigan-
// pattern head, painted tiny-axe green, flaring from a narrow waist to two
// curved bits ground bright; a straight hickory handle, oval, with its grain,
// swelling to a knob, its end and wedge showing through the top of the eye.
// Modelled as a signed-distance field, ray-cast cell by cell into ASCII for a stationary send-button mark. The bright steel reflects a
// studio that stays put while the axe turns, so its shine slides over it.

import { AsciiArt, runs, type Frame } from "./ascii.tsx";

const COLS = 64;
const ROWS = 64;
const CELL_H = 0.29;
/** A character cell is about this much taller than it is wide. */
const CELL_W = CELL_H / 1.72;
const NEAR = -6;
const FAR = 6;
const STEP = 0.03;
/** A ray passing this close to the axe shows it faintly: about half a cell. */
const NEAR_MISS = 0.08;
/** Nothing of the axe is further than this from the handle's line. */
const REACH = 5.15;
const RAMP = " .,:;-=+*#%@";
/** The faintest character a lit surface gets. */
const DENSE = 3;

const PAINT: RGB = [46, 116, 52];
const STEEL: RGB = [205, 214, 224];
const WOOD: RGB = [232, 160, 84];
const END_GRAIN: RGB = [176, 118, 62];

type RGB = [number, number, number];
type V3 = [number, number, number];
type Part = "paint" | "steel" | "wood" | "end";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
function smooth(a: number, b: number, v: number) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// The axe, in its own space: the handle up the y axis, the head across x
// (a bit each way) centred at y = 0, its cheeks facing ±z. A unit is about
// an inch.

/** From the eye to either edge. */
const HEAD = 5;
/** How far the bits are ground bright, back from the edge. */
const BEVEL = 0.85;

/** Half the head's height, from the narrow waist at the eye to the bit. */
const headHalf = (t: number) => 1.2 + 1.65 * Math.pow(t, 1.3);
/** Where the edge is at a height: the bit's gentle curve. */
const edgeAt = (y: number) => HEAD - 0.45 * (y / headHalf(1)) ** 2;
/** Half the head's thickness: full round the eye, thinning to the edge,
 * the cheeks a little full. */
function headThick(t: number, y: number, half: number) {
  const k = smooth(0.12, 1, t);
  return (0.04 + 0.95 * Math.pow(1 - k, 1.1)) * (1 - 0.15 * (y / half) ** 2);
}

function head(x: number, y: number, z: number): [number, Part] {
  const ax = Math.abs(x);
  const t = Math.min(ax / HEAD, 1);
  const half = headHalf(t);
  const edge = edgeAt(y);
  const d = 0.8 * Math.max(ax - edge, Math.abs(y) - half, Math.abs(z) - headThick(t, y, half));
  return [d, ax > edge - BEVEL ? "steel" : "paint"];
}

const HANDLE_TOP = 1.55;
const HANDLE_BOTTOM = -14;

/** The handle's half-widths, across the swing (x) and the cheeks (z): an
 * oval, slimmest mid-way, swelling into the knob. */
function handleSize(y: number): [number, number] {
  const along = clamp((y - HANDLE_BOTTOM) / (HANDLE_TOP - HANDLE_BOTTOM), 0, 1);
  const slim = 1 - 0.1 * Math.sin(Math.PI * along);
  const knob = 1 + 0.32 * smooth(2.2, 0, y - HANDLE_BOTTOM);
  return [0.82 * slim * knob, 0.56 * slim * knob];
}

function handle(x: number, y: number, z: number): [number, Part] {
  const [rx, rz] = handleSize(clamp(y, HANDLE_BOTTOM, HANDLE_TOP));
  const side = (Math.hypot(x / rx, z / rz) - 1) * Math.min(rx, rz);
  const d = Math.max(side, y - HANDLE_TOP, HANDLE_BOTTOM - y);
  return [d, y > HANDLE_TOP - 0.03 || y < HANDLE_BOTTOM + 0.03 ? "end" : "wood"];
}

function axe([x, y, z]: V3): [number, Part] {
  const h = head(x, y, z);
  const w = handle(x, y, z);
  return h[0] < w[0] ? h : w;
}

/** Halfway up, so it turns in the middle of the frame. */
const MIDDLE = -5.75;

// Turning and lighting

type Rot = { spin: number; lean: number };

const rotation: Rot = { spin: 0, lean: 0.1 };

// From the screen's space into the axe's: lean back to look down on it a
// little, then turn it about the handle.
function toModel([x, y, z]: V3, { spin, lean }: Rot): V3 {
  const cl = Math.cos(lean);
  const sl = Math.sin(lean);
  const y1 = y * cl - z * sl;
  const z1 = y * sl + z * cl;
  const cs = Math.cos(spin);
  const ss = Math.sin(spin);
  return [x * cs - z1 * ss, y1 + MIDDLE, x * ss + z1 * cs];
}

const distance = (p: V3, rot: Rot) => axe(toModel(p, rot));

function unit([x, y, z]: V3): V3 {
  const n = Math.hypot(x, y, z);
  return n === 0 ? [0, 0, -1] : [x / n, y / n, z / n];
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function normal([x, y, z]: V3, rot: Rot): V3 {
  const e = 0.015;
  return unit([
    distance([x + e, y, z], rot)[0] - distance([x - e, y, z], rot)[0],
    distance([x, y + e, z], rot)[0] - distance([x, y - e, z], rot)[0],
    distance([x, y, z + e], rot)[0] - distance([x, y, z - e], rot)[0],
  ]);
}

// Light from above, to the left and from behind the viewer, who looks along +z;
// and a weaker one from the right and behind, to pick out the far edge.
const LIGHT = unit([-0.5, 0.7, -0.55]);
const RIM = unit([0.9, 0.25, 0.35]);

/** What bright steel shows of the studio: bright overhead, a dark band low
 * down (the floor's edge, well below the axe), grey floor. */
function studio([, y]: V3) {
  const t = y + 0.4;
  if (t > 0.12) return 0.75 + 0.25 * Math.min((t - 0.12) * 2, 1);
  if (t > -0.12) return 0.12 + 0.63 * ((t + 0.12) / 0.24) ** 2;
  return 0.12 + 0.3 * Math.min((-0.12 - t) * 1.5, 1);
}

/** Hickory's grain, running the handle's length: -1 to 1. */
function grain([x, y, z]: V3) {
  return Math.sin(6 * (x * 0.9 + z * 0.5) + 1.6 * Math.sin(y * 0.33) + 0.8 * Math.sin(y * 1.3 + x * 2.5));
}

/** Where a ray meets the axe; or, if it passes close by (a thin edge),
 * how close, so that can show as a fainter character. */
function cast(x: number, y: number, rot: Rot): { point: V3; part: Part; miss: number } | null {
  if (Math.abs(x) > REACH) return null;
  let near: { point: V3; part: Part; miss: number } | null = null;
  for (let z = NEAR; z <= FAR; ) {
    const [d, part] = distance([x, y, z], rot);
    if (d < 0.008) return { point: [x, y, z], part, miss: 0 };
    if (d < (near?.miss ?? NEAR_MISS)) near = { point: [x, y, z], part, miss: d };
    z += Math.max(d * 0.6, STEP);
  }
  return near;
}

function cell(col: number, row: number, rot: Rot): [string, string | null] {
  const x = (col - (COLS - 1) / 2) * CELL_W;
  const y = -(row - (ROWS - 1) / 2) * CELL_H;
  const hit = cast(x, y, rot);
  if (!hit) return [" ", null];
  const { point, part, miss } = hit;
  const n = normal(point, rot);
  const diffuse = Math.max(dot(n, LIGHT), 0);
  const rim = 0.3 * Math.max(dot(n, RIM), 0);
  const vn = n[2];
  const reflect: V3 = [-2 * vn * n[0], -2 * vn * n[1], 1 - 2 * vn * n[2]];
  let light: number;
  let gloss: number;
  if (part === "steel") {
    // Ground bright: mostly reflection.
    gloss = Math.pow(Math.max(dot(reflect, LIGHT), 0), 50);
    light = clamp(0.88 * studio(reflect) + 0.12 * diffuse + rim + gloss, 0, 1);
  } else if (part === "paint") {
    // Enamel: its colour lit, with a sheen of the studio.
    gloss = 0.7 * Math.pow(Math.max(dot(reflect, LIGHT), 0), 30);
    light = clamp(0.14 + 0.22 * studio(reflect) + 0.6 * diffuse + rim + gloss, 0, 1);
  } else {
    // Oiled hickory: the grain in the colour, a soft sheen.
    gloss = 0.3 * Math.pow(Math.max(dot(reflect, LIGHT), 0), 16);
    const g = part === "wood" ? 0.12 * grain(toModel(point, rot)) : 0;
    light = clamp(0.2 + 0.7 * diffuse + rim + gloss + g, 0, 1);
  }
  const base = part === "steel" ? STEEL : part === "paint" ? PAINT : part === "wood" ? WOOD : END_GRAIN;
  const white = part === "steel" ? 120 : 60;
  const shade = (c: number) => Math.round(Math.min(c * (0.16 + 0.84 * light) + white * gloss, 255));
  const colour = `rgb(${shade(base[0])},${shade(base[1])},${shade(base[2])})`;
  if (miss > 0) return [miss < NEAR_MISS / 2 ? ":" : ".", colour];
  return [RAMP[DENSE + Math.round(light * (RAMP.length - 1 - DENSE))], colour];
}

function frame(): Frame {
  const rot = rotation;
  const rows: Frame = [];
  for (let row = 0; row < ROWS; row++) rows.push(runs(Array.from({ length: COLS }, (_, col) => cell(col, row, rot))));
  return rows;
}

/** tiny-axe's double-bit axe; stationary when used as a button mark. */
export function Axe() {
  return <AsciiArt make={frame} label="tiny-axe: a double-bit axe" class="axe" />;
}

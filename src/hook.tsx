// BusterClaw's mark: a pirate's hook, modelled as a signed-distance field (a
// polished steel hook tapering to its point, a brass collar, and a leather
// cuff bound in brass and riveted), ray-cast cell by cell into ASCII and
// spun about the arm (played by ascii.tsx). The metal reflects a sky that
// stays put while the hook turns, so its shine slides over it as steel's does.

import { AsciiArt, runs, type Frame } from "./ascii.tsx";

const COLS = 50;
const ROWS = 32;
const FRAMES = 72;
const FRAME_MS = 60;
const CELL_H = 0.205;
/** A character cell is about this much taller than it is wide. */
const CELL_W = CELL_H / 1.72;
const NEAR = -4;
const FAR = 4;
const STEP = 0.02;
/** A ray passing this close to the hook shows it faintly: about half a cell. */
const NEAR_MISS = 0.06;
/** Nothing of the hook is further than this from the arm's line. */
const REACH = 2.6;
const RAMP = " .,:;-=+*#%@";
/** The faintest character a lit surface gets. */
const DENSE = 3;

const STEEL: RGB = [196, 208, 222];
const BRASS: RGB = [232, 178, 74];
const LEATHER: RGB = [128, 58, 38];

type RGB = [number, number, number];
type V3 = [number, number, number];
type Part = "steel" | "brass" | "leather";

// The hook, in its own space: the arm up the y axis, the hook curling over
// towards +x.

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
function smooth(a: number, b: number, v: number) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** The hook's curve: its centre, and how far it bends out. */
const BEND: [number, number] = [1.15, 0.75];
const BEND_R = 1.15;
/** Where the curve ends, at the point (an angle about its centre): round
 * past the bottom, so the point tips back up. */
const POINT_AT = -1.85;
/** How much tighter the curve gets towards the point, so it curls in. */
const CURL = 0.4;

/** The curve's radius, from the shank (s = 0) to the point (s = 1). */
const bendRadius = (s: number) => BEND_R * (1 - CURL * smooth(0.4, 1, s));
const ROD = 0.22;
/** The point's own thickness, so it doesn't vanish between cells. */
const TIP = 0.03;

/** The cuff's radius up its side: a leather cup, a little full in the middle. */
const CUFF_BOTTOM = -3.0;
const CUFF_TOP = -0.9;
function cuffRadius(y: number) {
  const t = (y - CUFF_BOTTOM) / (CUFF_TOP - CUFF_BOTTOM);
  return 1.15 + (0.72 - 1.15) * t + 0.06 * Math.sin(Math.PI * t);
}

function torus(r: number, y: number, ringR: number, ringY: number, thick: number) {
  return Math.hypot(r - ringR, y - ringY) - thick;
}

/** The steel: a straight shank out of the collar, then the curve, thinning to a point. */
function steel(x: number, y: number, z: number) {
  const shankR = ROD + 0.02 * smooth(BEND[1], -0.5, y);
  const shank = Math.max(Math.hypot(x, z) - shankR, -0.6 - y, y - BEND[1]);

  const px = x - BEND[0];
  const py = y - BEND[1];
  const angle = Math.atan2(py, px);
  // From the shank (angle π) over the top and round to the point.
  const span = Math.PI - POINT_AT;
  let curve: number;
  if (angle >= POINT_AT) {
    const s = (Math.PI - angle) / span;
    const r = ROD * Math.pow(1 - smooth(0.45, 1, s), 0.55) + TIP;
    curve = Math.hypot(Math.hypot(px, py) - bendRadius(s), z) - r;
  } else {
    const tip: V3 = [BEND[0] + bendRadius(1) * Math.cos(POINT_AT), BEND[1] + bendRadius(1) * Math.sin(POINT_AT), 0];
    curve = Math.hypot(x - tip[0], y - tip[1], z) - TIP;
  }
  return Math.min(shank, curve);
}

/** The brass: the collar the hook screws into, and the cuff's bands and rivets. */
function brass(x: number, y: number, z: number) {
  const r = Math.hypot(x, z);
  let d = Math.max(r - 0.3, CUFF_TOP - y, y + 0.48);
  d = Math.min(d, torus(r, y, 0.3, -0.52, 0.065));
  d = Math.min(d, torus(r, y, 0.36, -0.82, 0.07));
  // A plate over the cuff's mouth.
  d = Math.min(d, Math.max(Math.hypot(r / 0.74, (y - CUFF_TOP) / 0.16) - 1, CUFF_TOP - 0.02 - y));
  d = Math.min(d, torus(r, y, cuffRadius(CUFF_TOP) + 0.02, CUFF_TOP, 0.085));
  d = Math.min(d, torus(r, y, cuffRadius(CUFF_BOTTOM) + 0.02, CUFF_BOTTOM, 0.1));
  const mid = -1.95;
  d = Math.min(d, torus(r, y, cuffRadius(mid) + 0.01, mid, 0.05));
  // Six rivets round the cuff, between the bands.
  const sector = (2 * Math.PI) / 6;
  const a = Math.atan2(z, x);
  for (const [ry, off] of [[-1.42, 0], [-2.5, sector / 2]]) {
    const k = Math.round((a - off) / sector) * sector + off;
    const rr = cuffRadius(ry);
    d = Math.min(d, Math.hypot(x - rr * Math.cos(k), y - ry, z - rr * Math.sin(k)) - 0.075);
  }
  return d;
}

function leather(x: number, y: number, z: number) {
  const r = Math.hypot(x, z);
  const slope = (cuffRadius(CUFF_TOP) - cuffRadius(CUFF_BOTTOM)) / (CUFF_TOP - CUFF_BOTTOM);
  return Math.max((r - cuffRadius(y)) / Math.hypot(1, slope), CUFF_BOTTOM - y, y - CUFF_TOP);
}

function hook([x, y, z]: V3): [number, Part] {
  const s = steel(x, y, z);
  const b = brass(x, y, z);
  const l = leather(x, y, z);
  if (s < b && s < l) return [s, "steel"];
  return b < l ? [b, "brass"] : [l, "leather"];
}

/** Halfway up the hook, so it turns in the middle of the frame. */
const MIDDLE = -0.55;

// Turning and lighting

type Rot = { spin: number; lean: number };

const rotation = (frame: number): Rot => ({ spin: (frame * 2 * Math.PI) / FRAMES, lean: 0.26 });

// From the screen's space into the hook's: lean back to look down on it a
// little, then turn it about the arm.
function toModel([x, y, z]: V3, { spin, lean }: Rot): V3 {
  const cl = Math.cos(lean);
  const sl = Math.sin(lean);
  const y1 = y * cl - z * sl;
  const z1 = y * sl + z * cl;
  const cs = Math.cos(spin);
  const ss = Math.sin(spin);
  return [x * cs - z1 * ss, y1 + MIDDLE, x * ss + z1 * cs];
}

const distance = (p: V3, rot: Rot) => hook(toModel(p, rot));

function unit([x, y, z]: V3): V3 {
  const n = Math.hypot(x, y, z);
  return n === 0 ? [0, 0, -1] : [x / n, y / n, z / n];
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function normal([x, y, z]: V3, rot: Rot): V3 {
  const e = 0.006;
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
const HALF = unit([LIGHT[0], LIGHT[1], LIGHT[2] - 1]);

/** What polished metal shows of the world: a bright sky, a bright band at
 * the horizon, dark ground. */
function sky([, y]: V3) {
  // The horizon sits a little below level, as the hook is seen from above.
  const t = y + 0.35;
  if (t > 0) return 0.7 + 0.3 * Math.pow(1 - Math.min(t, 1), 3);
  return 0.18 + 0.6 * Math.pow(1 + Math.max(t, -1), 5);
}

/** Where a ray meets the hook; or, if it passes close by (a thin edge, the
 * point), how close, so that can show as a fainter character. */
function cast(x: number, y: number, rot: Rot): { point: V3; part: Part; miss: number } | null {
  if (Math.abs(x) > REACH) return null;
  let near: { point: V3; part: Part; miss: number } | null = null;
  for (let z = NEAR; z <= FAR; ) {
    const [d, part] = distance([x, y, z], rot);
    if (d < 0.004) return { point: [x, y, z], part, miss: 0 };
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
  let light: number;
  let gloss: number;
  if (part === "leather") {
    // Leather: mostly matte, with a soft sheen and a little grain.
    const m = toModel(point, rot);
    const grain = 0.06 * Math.sin(m[0] * 23.1 + m[1] * 7.3) * Math.sin(m[2] * 19.7 - m[1] * 11.9);
    gloss = 0.35 * Math.pow(Math.max(dot(n, HALF), 0), 10);
    light = clamp(0.26 + 0.66 * diffuse + rim + gloss + grain, 0, 1);
  } else {
    // Metal: the sky it reflects, and a hard glint of the light.
    const vn = n[2];
    const reflect: V3 = [-2 * vn * n[0], -2 * vn * n[1], 1 - 2 * vn * n[2]];
    gloss = Math.pow(Math.max(dot(reflect, LIGHT), 0), part === "steel" ? 60 : 30);
    const env = sky(reflect);
    light = clamp(0.04 + 0.72 * env + 0.16 * diffuse + rim + gloss, 0, 1);
  }
  const base = part === "steel" ? STEEL : part === "brass" ? BRASS : LEATHER;
  const white = part === "leather" ? 50 : 150;
  const shade = (c: number) => Math.round(Math.min(c * (0.18 + 0.82 * light) + white * gloss, 255));
  const colour = `rgb(${shade(base[0])},${shade(base[1])},${shade(base[2])})`;
  if (miss > 0) return [miss < NEAR_MISS / 2 ? ":" : ".", colour];
  return [RAMP[DENSE + Math.round(light * (RAMP.length - 1 - DENSE))], colour];
}

export function frame(index: number): Frame {
  const rot = rotation(index);
  const rows: Frame = [];
  for (let row = 0; row < ROWS; row++) rows.push(runs(Array.from({ length: COLS }, (_, col) => cell(col, row, rot))));
  return rows;
}

/** The spinning hook. */
export function Hook() {
  return <AsciiArt make={frame} count={FRAMES} frameMs={FRAME_MS} label="BusterClaw: a spinning pirate's hook" class="hook" />;
}

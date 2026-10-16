// BusterClaw's mark: Captain Hook's hook from Hook (1991), after Tony
// Swatton's reproduction of it. A polished steel hook in an S, rising from
// the hand cover, leaning back, arching over and sweeping out to its point,
// tapering all the way. The cover is engraved silver: a neck, a domed lid, a
// round body, an engraved band and a skirt cut into six scallops, its seams
// trimmed in gold rope. Modelled as a signed-distance field, ray-cast cell by
// cell into ASCII and spun about the arm (played by ascii.tsx). The metal
// reflects a studio that stays put while the hook turns, so the shine slides
// over it as it does over polished steel.

import { AsciiArt, runs, type Frame } from "./ascii.tsx";

const COLS = 54;
const ROWS = 64;
const FRAMES = 72;
const FRAME_MS = 60;
const CELL_H = 0.2925;
/** A character cell is about this much taller than it is wide. */
const CELL_W = CELL_H / 1.72;
const NEAR = -4.5;
const FAR = 4.5;
const STEP = 0.03;
/** A ray passing this close to the hook shows it faintly: about half a cell. */
const NEAR_MISS = 0.085;
/** Nothing of the hook is further than this from the arm's line. */
const REACH = 3.85;
const RAMP = " .,:;-=+*#%@";
/** The faintest character a lit surface gets. */
const DENSE = 3;

const STEEL: RGB = [200, 210, 224];
const SILVER: RGB = [218, 212, 200];
const GOLD: RGB = [214, 168, 84];
const INSIDE: RGB = [70, 68, 64];

type RGB = [number, number, number];
type V3 = [number, number, number];
type Part = "steel" | "silver" | "gold" | "inside";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// The hook, in its own space: the arm up the y axis, the top of the cover's
// neck at y = 0, the hook's point out towards +x. A unit is about a
// centimetre.

// The steel's middle line, traced from the prop, and how thick it is there.
const LINE: [number, number, number][] = [
  [0, -0.3, 0.6],
  [-0.03, 0.8, 0.58],
  [-0.25, 1.5, 0.55],
  [-0.7, 2.2, 0.52],
  [-1.35, 2.9, 0.5],
  [-1.9, 3.6, 0.48],
  [-2.3, 4.4, 0.46],
  [-2.53, 5.2, 0.45],
  [-2.55, 5.9, 0.44],
  [-2.35, 6.6, 0.42],
  [-1.85, 7.15, 0.41],
  [-1.05, 7.4, 0.4],
  [-0.25, 7.35, 0.38],
  [0.35, 7.1, 0.36],
  [0.95, 6.65, 0.33],
  [1.55, 6.2, 0.29],
  [2.25, 5.88, 0.23],
  [2.95, 5.72, 0.15],
  [3.65, 5.68, 0.03],
];

/** The line smoothed (Catmull-Rom), as short pieces: each a start, an end and their thicknesses. */
const PIECES = (() => {
  const at = (i: number) => LINE[clamp(i, 0, LINE.length - 1)];
  const points: [number, number, number][] = [];
  const SPLIT = 3;
  for (let i = 0; i < LINE.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < SPLIT; k++) {
      const t = k / SPLIT;
      const t2 = t * t;
      const t3 = t2 * t;
      points.push(
        [0, 1, 2].map(
          (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3),
        ) as [number, number, number],
      );
    }
  }
  points.push(LINE[LINE.length - 1]);
  return points.slice(1).map((b, i) => {
    const a = points[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    return { ax: a[0], ay: a[1], dx, dy, len2, ra: a[2], rb: b[2], mx: a[0] + dx / 2, my: a[1] + dy / 2, half: Math.sqrt(len2) / 2 };
  });
})();

function steel(x: number, y: number, z: number) {
  let best = Infinity;
  for (const s of PIECES) {
    // A piece further away than the best so far can't be nearer.
    if (Math.hypot(x - s.mx, y - s.my, z) - s.half - s.ra > best) continue;
    const h = clamp(((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.len2, 0, 1);
    const d = Math.hypot(x - s.ax - s.dx * h, y - s.ay - s.dy * h, z) - (s.ra + (s.rb - s.ra) * h);
    if (d < best) best = d;
  }
  return best;
}

// The hand cover, top to bottom: its radius at each height.
const NECK = -0.4;
const LID = -1.5;
const BODY_TOP = -1.65;
const BODY_BOTTOM = -4.3;
const BAND_TOP = -4.5;
const BAND_BOTTOM = -6.45;
const SKIRT_TOP = -6.65;
/** Where the skirt's scallops reach, at their tips and between them. */
const TIPS = -9.8;
const ARCHES = -8.5;
const SHELL = 0.12;

function coverRadius(y: number) {
  if (y > NECK) return 0.7;
  if (y > LID) return 0.75 + 1.25 * Math.sin((((NECK - y) / (NECK - LID)) * Math.PI) / 2);
  if (y > BODY_TOP) return 2.08;
  if (y > BODY_BOTTOM) return 2.45 * Math.sqrt(Math.max(1 - ((y + 3.1) / 2.4) ** 2, 0));
  if (y > BAND_TOP) return 2.45;
  if (y > BAND_BOTTOM) return 2.36;
  if (y > SKIRT_TOP) return 2.42;
  return 2.2 + 0.25 * Math.pow((SKIRT_TOP - y) / (SKIRT_TOP - TIPS), 1.5);
}

/** The skirt's edge at an angle round the arm: six rounded scallops. */
const hem = (a: number) => ARCHES + (TIPS - ARCHES) * Math.pow((1 + Math.cos(6 * a)) / 2, 0.7);

/** The cover: a shell, open under the scallops. Whether a point is on its
 * inside, seen through them. */
function cover(y: number, r: number, a: number): [number, boolean] {
  const e = 0.05;
  const slope = (coverRadius(y + e) - coverRadius(y - e)) / (2 * e);
  const outer = (r - coverRadius(y)) / Math.hypot(1, slope);
  // Hollow only in the skirt; above it the shell is filled.
  const inner = y < SKIRT_TOP ? -outer - SHELL : -Infinity;
  return [Math.max(outer, inner, hem(a) - y, y), outer < -SHELL / 2];
}

const torus = (r: number, y: number, ringR: number, ringY: number, thick: number) => Math.hypot(r - ringR, y - ringY) - thick;

/** The gold rope round the cover's seams and along its scalloped hem. */
function gold(r: number, y: number, a: number) {
  let d = torus(r, y, 0.72, NECK, 0.07);
  d = Math.min(d, torus(r, y, 2.04, LID, 0.08));
  d = Math.min(d, torus(r, y, 2.45, BODY_BOTTOM - 0.1, 0.08));
  d = Math.min(d, torus(r, y, 2.42, BAND_BOTTOM - 0.1, 0.08));
  const edge = hem(a);
  return Math.min(d, Math.hypot(r - coverRadius(edge), y - edge) - 0.08);
}

function hook([x, y, z]: V3): [number, Part] {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  let d = y > NECK - 0.2 ? steel(x, y, z) : Infinity;
  let part: Part = "steel";
  const [c, inside] = cover(y, r, a);
  if (c < d) [d, part] = [c, inside ? "inside" : "silver"];
  const g = gold(r, y, a);
  if (g < d) [d, part] = [g, "gold"];
  return [d, part];
}

/** Engraving: scrolls over the neck, the lid, the band and the skirt; the body is plain. */
function engraved([x, y, z]: V3) {
  if (y < BODY_TOP && y > BODY_BOTTOM) return false;
  const a = Math.atan2(z, x);
  const s = Math.sin(a * 9 + 2.2 * Math.sin(y * 3.1)) * Math.sin(y * 4.3 + 1.8 * Math.sin(a * 12));
  return Math.abs(s) < 0.15;
}

/** Halfway up, so it turns in the middle of the frame. */
const MIDDLE = -1.05;

// Turning and lighting

type Rot = { spin: number; lean: number };

const rotation = (frame: number): Rot => ({ spin: (frame * 2 * Math.PI) / FRAMES, lean: 0.2 });

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
  const e = 0.02;
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

/** What polished metal shows of the studio: bright overhead, a dark band
 * low down (the floor's edge), grey floor. Steel this polished is mostly
 * black and white. */
function studio([, y]: V3) {
  const t = y + 0.15;
  if (t > 0.12) return 0.75 + 0.25 * Math.min((t - 0.12) * 2, 1);
  if (t > -0.12) return 0.12 + 0.63 * ((t + 0.12) / 0.24) ** 2;
  return 0.12 + 0.3 * Math.min((-0.12 - t) * 1.5, 1);
}

/** Where a ray meets the hook; or, if it passes close by (a thin edge, the
 * point), how close, so that can show as a fainter character. */
function cast(x: number, y: number, rot: Rot): { point: V3; part: Part; miss: number } | null {
  if (Math.abs(x) > REACH) return null;
  let near: { point: V3; part: Part; miss: number } | null = null;
  for (let z = NEAR; z <= FAR; ) {
    const [d, part] = distance([x, y, z], rot);
    if (d < 0.01) return { point: [x, y, z], part, miss: 0 };
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
  if (part === "inside") {
    gloss = 0;
    light = 0.1 + 0.25 * diffuse;
  } else if (part === "steel") {
    // A mirror: almost all reflection.
    gloss = Math.pow(Math.max(dot(reflect, LIGHT), 0), 60);
    light = clamp(0.92 * studio(reflect) + 0.08 * diffuse + rim + gloss, 0, 1);
  } else {
    // Silver and gold, satin: some reflection, some of the light itself.
    gloss = Math.pow(Math.max(dot(reflect, LIGHT), 0), 24);
    light = clamp(0.12 + 0.3 * studio(reflect) + 0.55 * diffuse + rim + gloss, 0, 1);
    if (part === "silver" && engraved(toModel(point, rot))) light *= 0.7;
  }
  const base = part === "steel" ? STEEL : part === "silver" ? SILVER : part === "gold" ? GOLD : INSIDE;
  const shade = (c: number) => Math.round(Math.min(c * (0.16 + 0.84 * light) + 120 * gloss, 255));
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

/** Captain Hook's hook, spinning. */
export function Hook() {
  return <AsciiArt make={frame} count={FRAMES} frameMs={FRAME_MS} label="BusterClaw: Captain Hook's hook, spinning" class="hook" />;
}

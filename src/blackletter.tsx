// BusterClaw's mark: an Olde English B, as an illuminated capital in red ink
// and gold leaf. The letter is UnifrakturMaguntia's B, drawn once in a browser
// and sampled into a grid of ink (0–9 per character cell); here that ink is
// lit as a relief by a light circling it, so its edges catch the gold
// (played by ascii.tsx, like the axe).

import { AsciiArt, runs, type Frame } from "./ascii.tsx";

// How much ink each cell holds, 0–9.
const INK = [
  "0000035788887642000036788763000000",
  "0005899999999999721642259999710000",
  "0179842000025899998300004999970000",
  "0594000000000179999200000699994100",
  "0780000000000018999300000059975300",
  "0592000000000005999100024687310000",
  "0058410000131006993157999999996200",
  "0001345444310039610000112469999940",
  "0000000000001562000000000001799990",
  "0000000001478520000000000000089980",
  "0000001469999998400000000000079820",
  "0000000000269999985200000000595100",
  "0000000000002699999986433455410000",
  "0000000000000002466777654200000000",
].map((row) => [...row].map(Number));

const ROWS = INK.length;
const COLS = INK[0].length;
const FRAMES = 48;
const FRAME_MS = 70;
/** A character cell is about this much taller than it is wide. */
const CELL_ASPECT = 1.75;
/** How steep the ink's edges stand. */
const RELIEF = 0.9;
const RAMP = " .:-=+*#%@";

const RED: RGB = [214, 64, 52];
const GOLD: RGB = [242, 193, 78];

type RGB = [number, number, number];
type V3 = [number, number, number];

const ink = (row: number, col: number) => (INK[row]?.[col] ?? 0) / 9;

function unit([x, y, z]: V3): V3 {
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// The ink as a relief: its slope across and up the page.
function normal(row: number, col: number): V3 {
  const across = (ink(row, col + 1) - ink(row, col - 1)) / 2;
  const up = (ink(row - 1, col) - ink(row + 1, col)) / 2 / CELL_ASPECT;
  return unit([-across * RELIEF * 4, -up * RELIEF * 4, 1]);
}

const NORMALS = INK.map((row, r) => row.map((_, c) => normal(r, c)));

function frame(index: number): Frame {
  // The light goes round the letter, a little above it.
  const turn = (index * 2 * Math.PI) / FRAMES;
  const light = unit([Math.cos(turn) * 0.8, Math.sin(turn) * 0.8, 0.6]);
  const half = unit([light[0], light[1], light[2] + 1]);

  return INK.map((row, r) =>
    runs(
      row.map((amount, c): [string, string | null] => {
        if (amount === 0) return [" ", null];
        const n = NORMALS[r][c];
        const diffuse = Math.max(dot(n, light), 0);
        const gloss = Math.pow(Math.max(dot(n, half), 0), 18);
        const shade = 0.35 + 0.65 * Math.min(0.25 + 0.75 * diffuse, 1);
        const gold = Math.min(gloss * 1.4, 1);
        const mix = (i: number) => Math.round(RED[i] * shade * (1 - gold) + GOLD[i] * gold);
        return [RAMP[amount], `rgb(${mix(0)},${mix(1)},${mix(2)})`];
      }),
    ),
  );
}

/** The B, with "busterclaw" under it. */
export function BlackletterB() {
  return (
    <AsciiArt make={frame} count={FRAMES} frameMs={FRAME_MS} label="BusterClaw" class="axe mark-b">
      <div class="axe-name">
        <span class="r">buster</span>
        <span class="gl">claw</span>
      </div>
    </AsciiArt>
  );
}

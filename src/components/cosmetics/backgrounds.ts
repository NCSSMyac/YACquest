/**
 * Background tiles for the wardrobe. Each one fills the avatar frame (36×36, i.e. the 32×32
 * character tile plus a little headroom for hats) and is drawn procedurally from palette chars.
 */
import { EXTRA_PALETTE } from './art';
import { SEASONAL_BACKGROUNDS } from './seasonalArt';

export const FRAME = { x: -2, y: -4, w: 36, h: 36 } as const;

type Grid = string[][];
const blank = (ch: string): Grid => Array.from({ length: FRAME.h }, () => Array.from({ length: FRAME.w }, () => ch));
const set = (g: Grid, x: number, y: number, ch: string) => {
  if (y >= 0 && y < FRAME.h && x >= 0 && x < FRAME.w) g[y][x] = ch;
};
const stamp = (g: Grid, art: string[], x: number, y: number) =>
  art.forEach((row, dy) => [...row].forEach((ch, dx) => ch !== '.' && set(g, x + dx, y + dy, ch)));

const CLOUD = ['..wwww...', '.wwwwwww.', 'wwwwwwwwww', '.CCCCCCC.'];

function meadow(): Grid {
  const g = blank('0');
  for (let y = 0; y < 9; y++) for (let x = 0; x < FRAME.w; x++) g[y][x] = '1';
  stamp(g, CLOUD, 1, 5);
  stamp(g, CLOUD, 24, 2);
  // rolling hill line + grass
  for (let x = 0; x < FRAME.w; x++) {
    const top = 25 + Math.round(Math.sin(x / 5) * 1.5);
    for (let y = top; y < FRAME.h; y++) g[y][x] = y === top ? '3' : '2';
  }
  const flowers: [number, number, string][] = [[2, 30, 'q'], [7, 33, 'y'], [30, 29, 'w'], [33, 33, 'q'], [4, 27, 'y'], [26, 34, 'I'], [12, 34, 'w']];
  for (const [x, y, c] of flowers) {
    set(g, x, y, c);
    set(g, x, y + 1, '3');
  }
  return g;
}

function sunset(): Grid {
  const g = blank('5');
  const bands = ['8', '8', '8', '7', '7', '7', '7', '6', '6', '6', '6', '6', '5', '5', '5', '5', '5', '4', '4', '4', '4'];
  for (let y = 0; y < FRAME.h; y++) for (let x = 0; x < FRAME.w; x++) g[y][x] = bands[Math.min(bands.length - 1, Math.floor(y / 1.15))] ?? '4';
  // dithered band edges
  for (let y = 0; y < 24; y++) for (let x = (y % 2); x < FRAME.w; x += 4) if (Math.floor(y / 1.15) !== Math.floor((y + 1) / 1.15)) g[y][x] = g[y + 1][x];
  // big sun behind the character
  const cx = 18, cy = 24, r = 11;
  for (let y = 0; y < FRAME.h; y++) for (let x = 0; x < FRAME.w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) g[y][x] = (x - cx) ** 2 + (y - cy) ** 2 <= (r - 2) ** 2 ? '9' : '4';
  // purple hills
  for (let x = 0; x < FRAME.w; x++) {
    const top = 28 + Math.round(Math.cos(x / 4) * 1.2);
    for (let y = top; y < FRAME.h; y++) g[y][x] = y === top ? 'J' : 'K';
  }
  return g;
}

function nightSky(): Grid {
  const g = blank('A');
  for (let y = 0; y < 12; y++) for (let x = 0; x < FRAME.w; x++) g[y][x] = (y < 8 || (x + y) % 2) ? 'D' : 'A';
  const stars: [number, number][] = [[3, 3], [10, 1], [16, 6], [22, 2], [5, 12], [31, 10], [1, 20], [34, 18], [12, 9], [27, 14], [8, 23], [33, 25]];
  stars.forEach(([x, y], i) => set(g, x, y, i % 3 === 0 ? 'y' : 'w'));
  // twinkle crosses
  for (const [x, y] of [[7, 6], [29, 21]]) {
    set(g, x, y, 'w');
    set(g, x - 1, y, 'L');
    set(g, x + 1, y, 'L');
    set(g, x, y - 1, 'L');
    set(g, x, y + 1, 'L');
  }
  // crescent moon
  const mx = 29, my = 5;
  for (let y = 0; y < 12; y++)
    for (let x = 22; x < FRAME.w; x++) {
      const inMoon = (x - mx) ** 2 + (y - my) ** 2 <= 16;
      const bite = (x - mx + 2) ** 2 + (y - my + 1) ** 2 <= 10;
      if (inMoon && !bite) g[y][x] = 'y';
    }
  for (let x = 0; x < FRAME.w; x++) for (let y = 31; y < FRAME.h; y++) g[y][x] = y === 31 ? 'n' : 'D';
  return g;
}

function castle(): Grid {
  const g = blank('v');
  for (let y = 0; y < FRAME.h; y++) for (let x = 0; x < FRAME.w; x++) g[y][x] = y < 10 ? 'V' : y < 20 ? ((x + y) % 2 && y < 12 ? 'V' : 'v') : 'i';
  const S = 'K';
  const rect = (x0: number, y0: number, x1: number, y1: number, ch = S) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(g, x, y, ch);
  };
  // left tower
  rect(1, 8, 8, 35);
  for (let x = 1; x <= 8; x += 2) set(g, x, 7, S);
  // left tower roof
  for (let i = 0; i < 5; i++) rect(4 - i, 2 + i, 5 + i, 2 + i, 'J');
  set(g, 4, 1, 'J');
  set(g, 5, 1, 'J');
  set(g, 4, 0, 'r');
  set(g, 5, 0, 'r');
  // right tower
  rect(27, 6, 34, 35);
  for (let x = 27; x <= 34; x += 2) set(g, x, 5, S);
  for (let i = 0; i < 5; i++) rect(30 - i, i, 31 + i, i, 'J');
  // wall between
  rect(0, 16, 35, 35);
  for (let x = 0; x < FRAME.w; x += 3) rect(x, 15, x + 1, 15);
  // windows + gate
  for (const [x, y] of [[4, 11], [30, 9], [30, 13], [4, 15]]) {
    rect(x, y, x + 1, y + 1, 'y');
  }
  rect(13, 24, 22, 35, 'J');
  for (let i = 0; i < 3; i++) rect(14 + i, 23 - i, 21 - i, 23 - i, 'J');
  for (let x = 0; x < FRAME.w; x++) set(g, x, 35, 'k');
  return g;
}

function rainbow(): Grid {
  const g = blank('1');
  for (let y = 14; y < FRAME.h; y++) for (let x = 0; x < FRAME.w; x++) g[y][x] = '0';
  const bands = ['r', 'O', 'g', '2', 'N', 'p'];
  const cx = 17.5, cy = 34;
  for (let y = 0; y < FRAME.h; y++)
    for (let x = 0; x < FRAME.w; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const i = Math.floor(31 - d);
      if (i >= 0 && i < bands.length * 2) g[y][x] = bands[Math.floor(i / 2)];
    }
  stamp(g, CLOUD, -1, 28);
  stamp(g, CLOUD, 27, 28);
  stamp(g, ['.ww.', 'wwww'], 15, 3);
  for (let x = 0; x < FRAME.w; x++) for (let y = 33; y < FRAME.h; y++) g[y][x] = y === 33 ? '3' : '2';
  return g;
}

function treasure(): Grid {
  const g = blank('Z');
  for (let y = 0; y < FRAME.h; y++) for (let x = 0; x < FRAME.w; x++) if ((x * 7 + y * 3) % 11 === 0 && y < 22) g[y][x] = 'W';
  // the hoard: tall mounds at the sides, lower in the middle
  for (let x = 0; x < FRAME.w; x++) {
    const side = Math.abs(x - 17.5);
    const top = Math.round(30 - side * 0.75 + Math.sin(x * 1.7) * 1.2);
    for (let y = top; y < FRAME.h; y++) {
      const ch = y === top ? 'y' : (x + y * 2) % 5 === 0 ? 'y' : (x * 3 + y) % 4 === 0 ? 'G' : (x + y) % 7 === 0 ? 'T' : 'g';
      set(g, x, y, ch);
    }
  }
  // gems
  for (const [x, y, c] of [[3, 22, 'r'], [32, 21, 'N'], [8, 28, 'e'], [28, 27, 'p'], [1, 31, 'N'], [34, 30, 'r']] as [number, number, string][]) {
    set(g, x, y, c);
    set(g, x + 1, y, c);
    set(g, x, y + 1, 'k');
    set(g, x + 1, y + 1, c);
  }
  // shine sparkles
  for (const [x, y] of [[4, 12], [31, 10], [16, 3]]) {
    set(g, x, y, 'w');
    set(g, x - 1, y, 'y');
    set(g, x + 1, y, 'y');
    set(g, x, y - 1, 'y');
    set(g, x, y + 1, 'y');
  }
  return g;
}

/** Lighter / darker shade of a hex color. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  const r = ch((n >> 16) & 255), gg = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1)}`;
}

function campus(): Grid {
  // X = campus color, Y = a lighter shade in wide diagonal stripes, with little white pennant stars.
  const g = blank('X');
  for (let y = 0; y < FRAME.h; y++)
    for (let x = 0; x < FRAME.w; x++) if (((x + y) >> 2) % 2 === 0) g[y][x] = 'Y';
  for (const [x, y] of [[4, 4], [28, 2], [6, 18], [31, 15], [17, 1]]) {
    set(g, x, y, 'w');
    set(g, x - 1, y, 'Y');
    set(g, x + 1, y, 'Y');
    set(g, x, y - 1, 'Y');
    set(g, x, y + 1, 'Y');
  }
  for (let x = 0; x < FRAME.w; x++)
    for (let y = 30; y < FRAME.h; y++) g[y][x] = y === 30 ? 'k' : y === 31 ? 'g' : 'x';
  return g;
}


// ───────────── STAFF-ONLY backgrounds (0020) ─────────────

/** Council Chamber: stone hall, two blue council banners and torches. Free for all staff. */
function councilChamber(): Grid {
  const g = blank('J');
  // stone bricks
  for (let y = 0; y < 27; y++)
    for (let x = 0; x < FRAME.w; x++) {
      const row = Math.floor(y / 3);
      if (y % 3 === 2 || (x + (row % 2) * 3) % 6 === 0) g[y][x] = 'K';
    }
  // banners
  for (const bx of [3, 26]) {
    for (let y = 2; y < 20; y++) for (let x = bx; x < bx + 7; x++) g[y][x] = x === bx || x === bx + 6 ? 'k' : 'N';
    for (let x = bx; x < bx + 7; x++) g[2][x] = 'g';
    for (let x = bx + 1; x < bx + 6; x++) g[18][x] = 'g';
    // swallowtail
    set(g, bx + 1, 20, 'N'); set(g, bx + 2, 20, 'N'); set(g, bx + 4, 20, 'N'); set(g, bx + 5, 20, 'N');
    set(g, bx + 1, 21, 'k'); set(g, bx + 5, 21, 'k'); set(g, bx + 3, 19, 'k');
    // gold star emblem
    stamp(g, ['..g..', '.ggg.', 'ggggg', '.g.g.'], bx + 1, 8);
  }
  // torches
  for (const tx of [14, 21]) {
    set(g, tx, 6, 'y'); set(g, tx, 7, 'O'); set(g, tx - 1, 7, 'y'); set(g, tx + 1, 7, 'y');
    set(g, tx, 8, 'O'); set(g, tx, 9, 'k'); set(g, tx, 10, 'b'); set(g, tx, 11, 'b');
  }
  // checkered floor
  for (let y = 27; y < FRAME.h; y++) for (let x = 0; x < FRAME.w; x++) g[y][x] = y === 27 ? 'k' : (Math.floor(x / 3) + Math.floor((y - 28) / 2)) % 2 ? 'c' : 'C';
  return g;
}

/** Starlit Throne Room: a gold-and-velvet throne under a starry vault. Chair-granted. */
function starlitThrone(): Grid {
  const g = blank('8');
  for (let y = 0; y < FRAME.h; y++) for (let x = 0; x < FRAME.w; x++) g[y][x] = y < 14 ? 'D' : y < 18 ? ((x + y) % 2 ? 'D' : '8') : '8';
  const stars: [number, number][] = [[2, 2], [8, 5], [14, 1], [21, 4], [28, 2], [33, 7], [5, 11], [31, 13], [17, 8]];
  stars.forEach(([x, y], i) => set(g, x, y, i % 2 ? 'y' : 'w'));
  for (const [x, y] of [[11, 3], [25, 9]]) { set(g, x, y, 'w'); set(g, x - 1, y, 'L'); set(g, x + 1, y, 'L'); set(g, x, y - 1, 'L'); set(g, x, y + 1, 'L'); }
  // throne back (gold frame, red velvet) behind the character
  for (let y = 6; y < 31; y++)
    for (let x = 7; x < 29; x++) {
      const edge = x === 7 || x === 28 || y === 6;
      const trim = x === 8 || x === 27 || y === 7;
      g[y][x] = edge ? 'k' : trim ? 'g' : (x + y) % 5 === 0 ? 'Q' : 'r';
    }
  // finials
  for (const fx of [7, 27]) stamp(g, ['.kk.', 'kygk', 'kggk', '.kk.'], fx - 1, 2);
  stamp(g, ['..k..', '.kyk.', 'kygyk', '.kgk.'], 16, 1);
  // arms
  for (const ax of [3, 27]) for (let y = 22; y < 31; y++) for (let x = ax; x < ax + 6; x++) g[y][x] = y === 22 || x === ax || x === ax + 5 ? 'k' : y === 23 ? 'y' : 'g';
  // carpet + steps
  for (let y = 31; y < FRAME.h; y++) for (let x = 0; x < FRAME.w; x++) g[y][x] = y === 31 ? 'k' : x > 10 && x < 25 ? (y === 33 ? 'g' : 'r') : 'K';
  return g;
}

/** Hall of Heroes: a golden aura (soft radial glow + pixel sparkles) on a deep royal night. Only while you're Hero of the Week. */
function hallOfHeroes(): Grid {
  const g = blank('D');
  const cx = 17.5, cy = 16;
  // concentric bands from the character outwards: warm gold core → amber edge → royal violet → deep navy corners.
  // Each band dithers into the next ([radius, even-pixel color, odd-pixel color]) so the glow fades out softly.
  const bands: [number, string, string][] = [
    [9, 'y', 'y'], [11, 'y', 'g'], [13, 'g', 'g'], [14.5, 'g', 'G'], [16, 'G', 'G'],
    [17.5, 'G', '8'], [19, '8', 'K'], [21.5, 'K', 'K'], [24, 'K', 'D'],
  ];
  for (let y = 0; y < FRAME.h; y++)
    for (let x = 0; x < FRAME.w; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const band = bands.find(([r]) => d < r);
      if (band) g[y][x] = (x + y) % 2 ? band[2] : band[1];
    }
  // golden sparkles (4-point pixel stars) scattered around the aura
  const BIG = ['...g...', '...y...', '..y9y..', 'gy9w9yg', '..y9y..', '...y...', '...g...'];
  const MID = ['..g..', '..9..', 'g9w9g', '..9..', '..g..'];
  const SMALL = ['.g.', 'gwg', '.g.'];
  stamp(g, BIG, 0, 1);
  stamp(g, BIG, 28, 22);
  stamp(g, MID, 29, 3);
  stamp(g, MID, 1, 23);
  stamp(g, SMALL, 10, 0);
  stamp(g, SMALL, 24, 0);
  stamp(g, SMALL, 31, 13);
  stamp(g, SMALL, 1, 13);
  stamp(g, SMALL, 16, 32);
  for (const [x, y] of [[6, 9], [30, 10], [4, 31], [33, 33], [21, 2], [13, 3], [8, 34], [26, 34]]) set(g, x, y, 'y');
  return g;
}

const BUILDERS: Record<string, () => Grid> = {
  meadow,
  campus,
  sunset,
  night_sky: nightSky,
  castle,
  rainbow,
  treasure,
  // staff only (0020)
  council_chamber: councilChamber,
  starlit_throne: starlitThrone,
  hall_of_heroes: hallOfHeroes,
  // 0028 seasonal (seasonalArt.ts)
  ...SEASONAL_BACKGROUNDS,
};

const cache = new Map<string, string[]>();

/** Rows (36 chars each, frame coords) for a background id, or null if unknown. */
export function backgroundGrid(id: string): string[] | null {
  if (!BUILDERS[id]) return null;
  let rows = cache.get(id);
  if (!rows) {
    rows = BUILDERS[id]().map((r) => r.join(''));
    cache.set(id, rows);
  }
  return rows;
}

/** Palette overrides for the campus background. */
export function campusPalette(color: string): Record<string, string> {
  return { X: color, Y: shade(color, 0.14), x: shade(color, -0.45) };
}

export const BG_PALETTE = EXTRA_PALETTE;

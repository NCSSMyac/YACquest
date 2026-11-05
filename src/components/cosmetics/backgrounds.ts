/**
 * Background tiles for the wardrobe. Each one fills the avatar frame (36×36, i.e. the 32×32
 * character tile plus a little headroom for hats) and is drawn procedurally from palette chars.
 */
import { EXTRA_PALETTE } from './art';

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

const BUILDERS: Record<string, () => Grid> = {
  meadow,
  campus,
  sunset,
  night_sky: nightSky,
  castle,
  rainbow,
  treasure,
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

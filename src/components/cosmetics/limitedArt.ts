/**
 * 0033 LIMITED EDITION wardrobe art: "Latte Night Scholar" (Brew & Quest 2026).
 * Same conventions as art.ts / seasonalArt.ts: Sprite palette chars + EXTRA_PALETTE, '.' transparent;
 * hats/accessories in 32×32 character coordinates, the background is 36×36 (FRAME).
 * These items are only ever earned by checking in at a Brew & Quest event (cosmetics rule 'event').
 */
import type { Art } from './art';
import type { SeasonalArt } from './seasonalArt';

/** Extra colors (symbol chars not used anywhere else). Merged into EXTRA_PALETTE. */
export const LIMITED_PALETTE: Record<string, string> = {
  '(': '#f6e7c8', // knit cream
  ')': '#dcc296', // knit cream shadow
  '[': '#7a4a2a', // cocoa
  ']': '#55301a', // dark cocoa
  '{': '#18214a', // night wall
  '}': '#212d60', // night wall stripe
  '-': '#ffd98a', // lamp glow
  _: '#c99a62', // latte foam (caramel)
  '`': '#33427e', // window glass, lighter night
};

// ───────────── Hat: Cozy Knit Beanie (cream + cocoa stripes, ribbed cuff, pom-pom) ─────────────
const BEANIE = [
  '.....kkk.....',
  '....k(h(k....',
  '....k(()k....',
  '.....k)k.....',
  '...kk[[[kk...',
  '..k[[h[[[[k..',
  '.k((h((((()k.',
  '.k[[[[[[[[]k.',
  'k(((((((((()k',
  'k()()()()()(k',
  'k()()()()()(k',
  'kkkkkkkkkkkkk',
];

export const LIMITED_HAT_ART: Record<string, Art> = {
  cozy_beanie: { grid: BEANIE, sink: 3 },
};

// ───────────── Accessory: A+ Latte (white cup, heart latte art, "A+" on the cup, steam) ─────────────
const LATTE = [
  '...C...C.....',
  '....C...C....',
  '...C...C.....',
  '.kkkkkkkkk...',
  'k_w_w_____k..',
  'k_www___)_k..',
  'k__w______k..',
  'kwwwwwwwwwkk.',
  'kww[wwwwwCkkk',
  'kw[w[ww[wCk.k',
  'kw[[[w[[[Ckkk',
  'kw[w[ww[wCk..',
  '.kwwwwwwCk...',
  '..kkkkkkk....',
];

export const LIMITED_ACCESSORY_ART: Record<string, SeasonalArt> = {
  // Held at the side like the Diya; sits a little lower so the cup reads as "in hand".
  latte_aplus: { grid: LATTE, anchor: 'side', sink: 6 },
};

// ───────────── Background: Moonlit Study Nook (36×36) ─────────────
const W = 36;
const H = 36;
type Grid = string[][];
const blank = (ch: string): Grid => Array.from({ length: H }, () => Array.from({ length: W }, () => ch));
const set = (g: Grid, x: number, y: number, ch: string) => {
  if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = ch;
};
const stamp = (g: Grid, art: string[], x: number, y: number) =>
  art.forEach((row, dy) => [...row].forEach((ch, dx) => ch !== '.' && set(g, x + dx, y + dy, ch)));

/**
 * A cozy night study corner: a window with the moon and stars (upper left), a desk lamp throwing a warm
 * cone of light (right), stacked books on the desk. The middle stays calm night navy so every character,
 * incl. the Golden Yak, reads clearly.
 */
export function moonlitNook(): Grid {
  const g = blank('{');
  // soft wallpaper stripes
  for (let y = 0; y < 27; y++) for (let x = 2; x < W; x += 5) set(g, x, y, '}');

  // window (upper left): wood frame, night glass, moon, stars, cross bars
  const wx = 1, wy = 1, ww = 15, wh = 14;
  for (let y = wy; y < wy + wh; y++)
    for (let x = wx; x < wx + ww; x++) {
      const edge = x === wx || x === wx + ww - 1 || y === wy || y === wy + wh - 1;
      set(g, x, y, edge ? 'o' : y < wy + 5 ? 'D' : y < wy + 9 ? 'A' : '`');
    }
  for (let x = wx; x < wx + ww; x++) set(g, x, wy + 7, 'o');
  for (let y = wy; y < wy + wh; y++) set(g, wx + 7, y, 'o');
  // sill
  for (let x = wx - 1; x < wx + ww + 1; x++) set(g, x, wy + wh, 'b');
  // crescent moon (top-right pane)
  stamp(g, ['..yy.', '.y9..', 'y9...', 'y9...', '.y9..', '..yy.'], wx + 9, wy + 1);
  // stars
  for (const [x, y, c] of [[3, 3, 'w'], [6, 5, 'y'], [4, 10, 'w'], [11, 11, 'y'], [13, 10, 'w'], [2, 6, 'y']] as [number, number, string][]) set(g, x, y, c);
  stamp(g, ['.w.', 'wyw', '.w.'], wx + 2, wy + 9);

  // desk lamp (upper right, clear of the character): a green banker's-lamp shade on a brass arm, with a
  // soft warm cone of light falling down the right edge onto the desk
  for (let y = 7; y < 27; y++) {
    const left = 31 - Math.floor((y - 7) / 3);
    for (let x = left; x < W; x++) {
      const edge = x === left;
      if (!edge || (x + y) % 2 === 0) set(g, x, y, y < 9 ? '$' : '-');
    }
  }
  stamp(g, ['...kkkkkk', '..k3eeeek', '.keEeeeek', 'kkkkkkkkk'], 27, 3); // shade
  stamp(g, ['$$$$$$'], 29, 7); // bulb glow under the shade
  for (let y = 1; y < 3; y++) set(g, 33, y, 'G');
  for (let x = 33; x < W; x++) set(g, x, 1, 'g');
  stamp(g, ['..kkkkk', '.kGgggk', 'kkkkkkk'], 29, 24); // base on the desk
  // desk
  for (let y = 27; y < H; y++)
    for (let x = 0; x < W; x++) set(g, x, y, y === 27 ? 'F' : y === 28 ? 'B' : (x + y * 3) % 11 === 0 ? 'b' : 'B');
  // light pool on the desk under the lamp
  for (let x = 20; x < W; x++) if ((x + 27) % 2 === 0 || (x > 23 && x < 34)) set(g, x, 27, 'f');

  // stacked books (left, on the desk) + one open book on the right
  const BOOKS = [
    '.kkkkkkkk.',
    'krrrrrrrrk',
    'kwwwwwwwwk',
    'kkkkkkkkkk',
    '.kNNNNNNNNk',
    '.kwwwwwwwwk',
    'kkkkkkkkkkk',
    'keeeeeeeeek',
    'kpppppppppk',
  ];
  stamp(g, BOOKS, 0, 18);
  stamp(g, ['kkkk.kkkk', 'kwwwkwwwk', 'kCwCkwCwk', 'kkkkkkkkk'], 24, 24);
  return g;
}

export const LIMITED_BACKGROUNDS: Record<string, () => Grid> = {
  moonlit_nook: moonlitNook,
};

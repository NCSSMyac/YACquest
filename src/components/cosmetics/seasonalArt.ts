/**
 * 0028 SEASONAL wardrobe pixel art (same conventions as art.ts / backgrounds.ts: Sprite palette chars +
 * EXTRA_PALETTE, '.' transparent; hats/accessories in 32×32 character coordinates, backgrounds 36×36).
 *
 * Respect rules for this file (see docs/SETUP.md → Seasonal wardrobe): objects, flowers and landscapes
 * only — no costumes of people, no face paint, no religious deity imagery, no headdresses or feathers.
 * Have members of each community review changes before they go live.
 */
import type { Art } from './art';

/** Where a seasonal accessory sits: 'neck' (NECK_ANCHOR, default) or 'side' (held/beside, SIDE_ANCHOR). */
export type SeasonalArt = Art & { anchor?: 'neck' | 'side' };

/** Extra colors (symbols: every letter and digit is already taken). Merged into EXTRA_PALETTE. */
export const SEASONAL_PALETTE: Record<string, string> = {
  '~': '#e8711c', // marigold orange
  '!': '#a8431a', // rust
  '%': '#d9a21b', // mustard / harvest gold
  '=': '#2a1748', // deep plum night
  '+': '#4f2a78', // plum
  '&': '#24603d', // pine green
  '*': '#a9a3d6', // far ridge (haze)
  '@': '#7179b8', // mid ridge
  '#': '#454f8c', // near ridge
  '$': '#fff7d6', // lamp glow
  '?': '#5e3a22', // dark wood / bark
  ':': '#c79a5b', // dry corn stalk
  // 0031 Three Sisters Garden (golden hour over the NC Piedmont)
  '^': '#9cc3ea', // golden-hour upper sky
  ';': '#f9d39a', // low peach glow
  '<': '#8aa58c', // far Piedmont treeline (haze)
  '>': '#5f8a58', // near rolling hill
  '/': '#3f8a3c', // corn leaf / stalk green
  '|': '#7fbf4a', // sunlit leaf edge
  ',': '#245a2b', // bean vine (dark green)
  '"': '#6b4527', // garden soil
  "'": '#8a5c33', // soil mound top
};

// ───────────── Hat: Cempasúchil Crown (marigolds) ─────────────
// Three marigold pom-poms (orange, golden, orange) with leaves tucked between them.
const MARIGOLD = ['.k~k.', 'k~O~k', '~OgO~', 'k~O~k', '.k~k.'];
const MARIGOLD_GOLD = ['.k%k.', 'k%g%k', '%gyg%', 'k%g%k', '.k%k.'];

function crown(): string[] {
  const w = 17;
  const rows = Array.from({ length: 7 }, () => Array(w).fill('.'));
  const put = (art: string[], x: number, y: number) =>
    art.forEach((r, dy) => [...r].forEach((ch, dx) => ch !== '.' && (rows[y + dy][x + dx] = ch)));
  // leaves behind the flowers
  for (const [x, y, ch] of [[4, 4, 'e'], [5, 5, 'E'], [11, 5, 'E'], [12, 4, 'e'], [0, 5, 'e'], [16, 5, 'e'], [8, 6, 'e']] as [number, number, string][])
    rows[y][x] = ch;
  put(MARIGOLD, 0, 2);
  put(MARIGOLD, 12, 2);
  put(MARIGOLD_GOLD, 6, 1);
  // little buds
  put(['.k.', 'k~k', '.k.'], 4, 0);
  put(['.k.', 'k~k', '.k.'], 10, 0);
  // green band underneath
  for (let x = 1; x < w - 1; x++) if (rows[6][x] === '.') rows[6][x] = x % 2 ? 'e' : '3';
  return rows.map((r) => r.join(''));
}

export const SEASONAL_HAT_ART: Record<string, Art> = {
  cempasuchil_crown: { grid: crown(), sink: 3 },
};

// ───────────── Accessories ─────────────
export const SEASONAL_ACCESSORY_ART: Record<string, SeasonalArt> = {
  // A small clay oil lamp with a glowing flame, set beside the character.
  diya: {
    anchor: 'side',
    sink: 9,
    grid: [
      '....$....',
      '...$y$...',
      '...ywy...',
      '..$yOy$..',
      '....O....',
      'kk.....kk',
      'kFkkkkkFk',
      'kFFrFrFFk',
      '.kBFFFBk.',
      '..kBBBk..',
      '...kkk...',
    ],
  },
  // A cozy knit scarf in autumn stripes with a tiny leaf.
  harvest_scarf: {
    grid: [
      'kk.........kk',
      'k~k.......k~k',
      'k%~kk...kk~%k',
      'k!%~~kkk~~%!k',
      '.k!%%~~~%%!k.',
      '..kk!!~!!kk..',
      '....k~~k~k...',
      '...rk%%k%k...',
      '..r!k!!k!k...',
      '...rk~~kkk...',
      '....k%%k.....',
      '....kkkk.....',
    ],
  },
};

// ───────────── Backgrounds (36×36) ─────────────
const W = 36;
const H = 36;
type Grid = string[][];
const blank = (ch: string): Grid => Array.from({ length: H }, () => Array.from({ length: W }, () => ch));
const set = (g: Grid, x: number, y: number, ch: string) => {
  if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = ch;
};
const stamp = (g: Grid, art: string[], x: number, y: number) =>
  art.forEach((row, dy) => [...row].forEach((ch, dx) => ch !== '.' && set(g, x + dx, y + dy, ch)));
/** Vertical gradient from a list of colors (top → bottom), dithered at the seams. */
function sky(g: Grid, bands: string[], rows: number) {
  const step = rows / bands.length;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < W; x++) {
      const i = Math.min(bands.length - 1, Math.floor(y / step));
      const nextEdge = (i + 1) * step;
      const dither = i < bands.length - 1 && nextEdge - y <= 1 && (x + y) % 2 === 0;
      g[y][x] = dither ? bands[i + 1] : bands[i];
    }
}

/** Papel Picado: strings of colorful cut-paper banners over a warm dusk, marigold petals on the ofrenda cloth. */
export function papelPicado(): Grid {
  const g = blank('+');
  sky(g, ['=', '+', '+', '8', '7'], 28);
  for (const [x, y] of [[3, 9], [12, 8], [22, 10], [33, 8], [17, 9]]) set(g, x, y, 'y');
  const colors = ['Q', 'O', 'N', 'e', 'p', 'g'];
  // each flag: X = paper, '.' = cut-out (shows the sky), zigzag bottom
  const FLAG = ['XXXXX', 'XX.XX', 'X.X.X', 'XX.XX', 'XXXXX', 'X.X.X'];
  const string = (y0: number, sag: number, from: number, to: number, offset: number) => {
    for (let x = from; x < to; x++) set(g, x, y0 + Math.round(sag * Math.sin((Math.PI * (x - from)) / (to - from))), 'w');
    let i = offset;
    for (let x = from + 1; x + 5 <= to; x += 6, i++) {
      const top = y0 + 1 + Math.round(sag * Math.sin((Math.PI * (x + 2 - from)) / (to - from)));
      const c = colors[i % colors.length];
      stamp(g, FLAG.map((r) => r.replace(/X/g, c)), x, top);
    }
  };
  string(0, 2, 0, W, 0);
  string(11, 2, -3, 10, 3);
  string(11, 2, 26, W + 3, 4);
  // ofrenda cloth with marigold petals + two candles
  for (let y = 28; y < H; y++) for (let x = 0; x < W; x++) g[y][x] = y === 28 ? 'k' : y === 29 ? 'Q' : (x + y) % 2 ? 'p' : '+';
  for (const [x, y] of [[2, 32], [6, 34], [11, 31], [24, 33], [29, 31], [33, 34], [16, 34], [20, 32]]) {
    set(g, x, y, '~');
    set(g, x + 1, y, 'g');
  }
  for (const cx of [1, 32]) stamp(g, ['.y.', '.O.', 'kwk', 'kwk', 'kwk'], cx, 23);
  return g;
}

/** Rangoli & Diyas: a colorful rangoli (petal rings) on a warm night floor with glowing lamps. */
export function rangoliDiyas(): Grid {
  const g = blank('=');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x * 5 + y * 3) % 17 === 0 && y < 14) g[y][x] = '+';
  const cx = 17.5, cy = 19;
  // rings from the center out: [outer radius, color, petals (0 = plain ring), alt color]
  const rings: [number, string, number, string][] = [
    [3, 'y', 0, 'y'], [5.2, 'Q', 8, 'I'], [7.4, 'g', 0, 'g'], [9.8, 'O', 12, '~'],
    [12, 'e', 0, 'e'], [14.6, 'N', 16, 'L'], [16.4, 'p', 0, 'p'], [18.6, 'I', 20, 'Q'],
  ];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = (y - cy) * 1.05;
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = Math.atan2(dy, dx);
      let inner = 0;
      for (const [r, c, petals, alt] of rings) {
        if (d < r) {
          if (petals) {
            const t = (d - inner) / (r - inner); // 0..1 across the ring
            const lobe = Math.abs(Math.cos((a * petals) / 2)); // 1 at petal centers
            g[y][x] = t < lobe ? c : t < lobe + 0.25 ? alt : '=';
          } else g[y][x] = c;
          break;
        }
        inner = r;
      }
      // white dot outline just outside the rangoli
      if (d >= 18.6 && d < 19.4 && (x + y) % 2 === 0) g[y][x] = 'w';
    }
  // diyas in the four corners, glowing
  const DIYA = ['..$y$..', '..ywy..', '...O...', 'k.....k', 'kFrFrFk', '.kBBBk.', '..kkk..'];
  stamp(g, DIYA, 0, 0);
  stamp(g, DIYA, 29, 0);
  stamp(g, DIYA, 0, 29);
  stamp(g, DIYA, 29, 29);
  return g;
}

/** Autumn Harvest: golden fields, fall trees, corn stalks, pumpkins and falling leaves. */
export function autumnHarvest(): Grid {
  const g = blank('1');
  sky(g, ['1', '0', '9', '4'], 20);
  // far golden hills
  for (let x = 0; x < W; x++) {
    const top = 18 + Math.round(Math.sin(x / 6) * 1.5);
    for (let y = top; y < H; y++) g[y][x] = y === top ? 'G' : y < 25 ? '%' : 'g';
  }
  // field rows
  for (let y = 26; y < H; y += 3) for (let x = 0; x < W; x++) if ((x + y) % 4 !== 0) set(g, x, y, '%');
  // fall trees at the edges
  const TREE = [
    '..~O~O..',
    '.O~rO~O.',
    '~OrO~rO~',
    'O~O%~O~O',
    '.~rO~O~.',
    '..~O!~..',
    '...??...',
    '...??...',
    '...??...',
  ];
  stamp(g, TREE, -2, 7);
  stamp(g, TREE.map((r) => r.replace(/r/g, '%')), 30, 6);
  // corn stalks on the right
  for (const sx of [27, 29]) {
    for (let y = 15; y < 30; y++) set(g, sx, y, ':');
    stamp(g, ['3.', '.3'], sx - 1, 18);
    stamp(g, ['.3', '3.'], sx + 1, 22);
    stamp(g, ['k', 'g', 'y', 'g'], sx + 1, 19);
  }
  // pumpkins
  const PUMPKIN = ['...3...', '.kk3kk.', 'k~O~O~k', 'kO~O~Ok', 'k~O~O~k', '.kkkkk.'];
  stamp(g, PUMPKIN, 0, 29);
  stamp(g, PUMPKIN, 5, 31);
  stamp(g, PUMPKIN, 29, 30);
  // falling leaves
  for (const [x, y, c] of [[8, 4, 'O'], [14, 9, 'r'], [24, 3, '~'], [31, 16, 'r'], [3, 18, '%'], [21, 13, 'O'], [12, 27, '!'], [24, 33, '~']] as [number, number, string][]) {
    set(g, x, y, c);
    set(g, x + 1, y + 1, c);
  }
  return g;
}

/** Land of the Longleaf: a North Carolina dawn — Blue Ridge silhouettes, longleaf pines and a river. */
export function landOfLongleaf(): Grid {
  const g = blank('4');
  sky(g, ['8', '7', '6', '5', '4'], 22);
  // the sun just rising
  for (let y = 12; y < 22; y++) for (let x = 0; x < W; x++) if ((x - 17.5) ** 2 + (y - 21) ** 2 <= 36) g[y][x] = (x - 17.5) ** 2 + (y - 21) ** 2 <= 16 ? '9' : 'y';
  // three ridge layers (far → near)
  const ridge = (base: number, amp: number, freq: number, phase: number, ch: string) => {
    for (let x = 0; x < W; x++) {
      const top = Math.round(base - amp * (0.6 * Math.sin(x * freq + phase) + 0.4 * Math.sin(x * freq * 2.3 + phase * 1.7)));
      for (let y = Math.max(0, top); y < H; y++) g[y][x] = ch;
    }
  };
  ridge(15, 3, 0.22, 0.5, '*');
  ridge(19, 3, 0.3, 2.1, '@');
  ridge(23, 2.5, 0.27, 4.0, '#');
  // grass and the river
  for (let y = 26; y < H; y++) for (let x = 0; x < W; x++) g[y][x] = y === 26 ? '3' : '2';
  for (let y = 27; y < H; y++) {
    const c = 17 + Math.round(Math.sin((y - 27) / 2.2) * 5);
    const half = 2 + Math.floor((y - 27) / 3);
    for (let x = c - half; x <= c + half; x++) set(g, x, y, (x + y) % 5 === 0 ? 'w' : x === c - half || x === c + half ? 'N' : 'L');
  }
  // wiregrass tufts
  for (const [x, y] of [[2, 29], [7, 33], [28, 30], [33, 34], [4, 35]]) {
    set(g, x, y, '3');
    set(g, x + 1, y - 1, '3');
    set(g, x + 2, y, '3');
  }
  // longleaf pines: tall straight trunks, tufted needles at the top
  // (a sparse, irregular crown of needle clumps high on a long bare trunk)
  const CROWN = [
    '...&&&...',
    '..&3e3&..',
    '.&&3&3&&.',
    '&3e&?&3e&',
    '.&&.?.&&.',
    '..&&?&3&.',
    '.&3e?&&..',
    '..&&?....',
  ];
  const pine = (x: number, top: number, bottom: number) => {
    for (let y = top + 4; y <= bottom; y++) set(g, x, y, y % 4 === 0 ? 'o' : '?');
    stamp(g, CROWN, x - 4, top);
  };
  pine(2, 1, 30);
  pine(6, 6, 31);
  pine(32, 2, 30);
  pine(28, 8, 30);
  return g;
}

/**
 * Three Sisters Garden (Native American Heritage Month, 0031): corn, beans and squash growing together at
 * golden hour, NC Piedmont horizon behind. Tall corn stalks with bean vines climbing them at both edges,
 * broad squash leaves and a few squash on the mounds at their feet. Plants and landscape only: this
 * honors Indigenous agricultural knowledge; nothing here is clothing, regalia or a person.
 * The middle stays open (sky + soft hills) so every character, incl. the Golden Yak, reads clearly.
 */
export function threeSisters(): Grid {
  const g = blank('^');
  // golden-hour sky: soft blue overhead warming to peach and gold at the horizon (2-row dither at each seam)
  const bands = ['^', '^', '0', ';', '4'];
  const rows = 20, step = rows / bands.length;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < W; x++) {
      const i = Math.min(bands.length - 1, Math.floor(y / step));
      const toEdge = (i + 1) * step - y;
      const next = bands[Math.min(bands.length - 1, i + 1)];
      g[y][x] = toEdge <= 1 && (x + y) % 2 === 0 ? next : toEdge <= 2 && toEdge > 1 && (x + 2 * y) % 4 === 0 ? next : bands[i];
    }
  // low sun setting behind the treeline on the right, with a dithered halo
  for (let y = 9; y < 20; y++) for (let x = 0; x < W; x++) {
    const d = (x - 26) ** 2 + (y - 17) ** 2;
    if (d <= 8) g[y][x] = '9';
    else if (d <= 18 && (x + y) % 2 === 0) g[y][x] = '9';
  }
  // Piedmont horizon: a soft far treeline of rounded crowns, then gentle rolling hills (no mountains)
  for (let x = 0; x < W; x++) {
    const top = 18 - Math.round(Math.max(0, Math.sin(x * 1.25)) * 1 + Math.sin(x / 5) * 0.8);
    for (let y = top; y < H; y++) g[y][x] = '<';
  }
  for (let x = 0; x < W; x++) {
    const top = 22 + Math.round(Math.sin(x / 5 + 1) * 1.2);
    for (let y = top; y < H; y++) g[y][x] = y === top ? '|' : '>';
  }
  // garden ground: planting mounds (hills of soil) in rows
  for (let y = 27; y < H; y++) for (let x = 0; x < W; x++) g[y][x] = '"';
  for (const [mx, my] of [[3, 30], [17, 29], [32, 30], [10, 34], [25, 34]] as [number, number][])
    for (let y = my - 2; y <= my + 1; y++) for (let x = mx - 4; x <= mx + 4; x++)
      if (((x - mx) / 4.5) ** 2 + ((y - my) / 2.2) ** 2 <= 1) set(g, x, y, y === my - 2 || ((x - mx) / 4.5) ** 2 + ((y - my + 1) / 2.2) ** 2 <= 0.35 ? "'" : 'o');
  g[27] = g[27].map((c, x) => (x % 3 === 0 ? '>' : c)); // grass edge where the garden meets the hill
  // small distant corn rows on the hill (texture, behind the character)
  for (let x = 1; x < W; x += 3) {
    const base = 26;
    set(g, x, base, '/');
    set(g, x, base - 1, '/');
    set(g, x - 1, base - 2, x % 2 ? '/' : '|');
    set(g, x + 1, base - 2, x % 2 ? '|' : '/');
  }

  // ── The sisters: corn stalk + bean vine climbing it ──
  const corn = (x: number, top: number, bottom: number, flip: boolean) => {
    for (let y = top + 2; y <= bottom; y++) set(g, x, y, y % 5 === 0 ? '3' : '/');
    // golden tassel: a central spike with branches drooping to each side
    stamp(g, ['.g.', 'gGg', 'G.G', 'G.G'], x - 1, top - 1);
    set(g, x, top + 1, 'G');
    // long arching leaves, alternating sides, every 4 rows
    for (let y = top + 4, i = 0; y < bottom - 3; y += 4, i++) {
      const dir = (i % 2 === 0) !== flip ? 1 : -1;
      set(g, x + dir, y, '/');
      set(g, x + 2 * dir, y - 1, '|');
      set(g, x + 3 * dir, y - 1, '/');
      set(g, x + 4 * dir, y, '/');
    }
    // an ear of corn: golden kernels peeking out of a green husk, silk on top
    const ey = top + 9;
    const ex = x + (flip ? -2 : 1);
    stamp(g, ['.G', 'yg', 'gy', 'yg', 'E/', '.E'].map((r) => (flip ? [...r].reverse().join('') : r)), ex, ey);
  };
  // bean vine twining up a stalk: dark vine zig-zags left/right, little leaves, pods, a few flowers
  const beans = (x: number, top: number, bottom: number, phase: number) => {
    for (let y = bottom; y >= top + 5; y--) {
      const side = Math.round(Math.sin((y + phase) * 0.9));
      if (side !== 0) set(g, x + side, y, ',');
      if ((y + phase) % 6 === 0) set(g, x - side * 2 || x + 2, y, 'e'); // leaf
      if ((y + phase) % 9 === 4) { set(g, x + 2 * (side || 1), y, 'e'); set(g, x + 2 * (side || 1), y + 1, 'E'); } // hanging pod
      if ((y + phase) % 11 === 7) set(g, x - 2 * (side || 1), y, 'P'); // bean flower
    }
  };
  corn(1, 3, 30, false);
  beans(1, 3, 30, 0);
  corn(5, 7, 30, true);
  beans(5, 7, 30, 3);
  corn(34, 2, 30, true);
  beans(34, 2, 30, 1);
  corn(30, 8, 30, false);
  beans(30, 8, 30, 4);

  // ── Squash: broad leaves with pale veins along the mounds, and a few squash ──
  const LEAF = ['.3/3.', '3/E/3', '/3E3/', '.3/3.'];
  for (const [x, y] of [[-1, 28], [3, 30], [7, 31], [27, 30], [31, 28], [32, 32], [13, 33], [20, 33]] as [number, number][]) stamp(g, LEAF, x, y);
  // vines running between the mounds
  for (const [x, y] of [[8, 34], [9, 35], [12, 35], [22, 35], [25, 34], [26, 33]] as [number, number][]) set(g, x, y, ',');
  const ROUND = ['.,.', 'OgO', 'gOg', '.O.']; // round orange squash with a stem
  const LONG = [',..', 'gg.', '.gg', '.gG']; // golden crookneck
  stamp(g, ROUND, 0, 32);
  stamp(g, LONG, 6, 29);
  stamp(g, ROUND, 29, 31);
  stamp(g, LONG, 33, 33);
  stamp(g, ['.,', 'gO'], 17, 34);
  return g;
}

/** Background builders registered in backgrounds.ts. */
export const SEASONAL_BACKGROUNDS: Record<string, () => Grid> = {
  papel_picado: papelPicado,
  rangoli_diyas: rangoliDiyas,
  autumn_harvest: autumnHarvest,
  land_of_longleaf: landOfLongleaf,
  three_sisters: threeSisters,
};

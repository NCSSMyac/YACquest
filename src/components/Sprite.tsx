import type { AvatarId } from '../types';

/**
 * Pixel sprites drawn from text grids (characters are 32x32, chest/trophy 16x16). Each character maps to a color in the palette.
 * '.' is transparent. Add a new character by adding a grid + palette entry.
 */
export const PALETTE: Record<string, string> = {
  k: '#1b2340',
  w: '#ffffff',
  b: '#6e4426',
  B: '#a0663a',
  F: '#c98a52',
  f: '#e3b07a',
  h: '#fff4dc',
  H: '#d9bf8a',
  g: '#f6b93b',
  G: '#c98a12',
  n: '#0b2a5b',
  N: '#2f6fd6',
  L: '#86b9ff',
  s: '#ffd9b8',
  S: '#eeb48f',
  p: '#7a43c9',
  P: '#b48cf0',
  e: '#2f9e64',
  E: '#7fd8a6',
  m: '#a6ecd2',
  M: '#6fcfae',
  i: '#ffc2dd',
  I: '#f48fbd',
  Q: '#e0558f',
  v: '#cdbcff',
  V: '#a48ff0',
  c: '#9aa8bd',
  C: '#e6ecf5',
  q: '#ff98b4',
  u: '#ffffff',
  U: '#dcd6f7',
  y: '#ffe7a0',
  r: '#e0533f',
  o: '#8a5a2b',
  // Golden Yak (staff only)
  d: '#5a3304', // deep amber outline
  a: '#c27a0c', // amber shadow
  j: '#f2b02c', // gold
  l: '#ffd65e', // light gold
  t: '#fff0b0', // pale gold (snout)
  z: '#7a3fc0', // royal purple collar
};

// Human characters use fantasy skin tones (mint, pink, lilac) so nobody's real skin color is the default.
export const GRIDS: Record<AvatarId, string[]> = {
  yak: [
    '................................',
    '....k......................k....',
    '..kkhk....................khkk..',
    '.khHhk....................khHhk.',
    '.khhhhk........k.....k...khhhhk.',
    '.khhhhk..k...kkBkkk.kBk..khhhhk.',
    '.khhhhhkkBkkkFBBBFFkBBk.khhhhhk.',
    '..khhhhhkBBFFFBBBFFFBBBkhhhhhk..',
    '..khhhhhBBBBFBBBBBFBBBBhhhhhhk..',
    '...khkkkBBBBBBBBBBBBBBBBkkkhk...',
    '....k.kBBBBBBBBBBBBBBBBBBk.k....',
    '......kBBBBBBBBBBBBBBBBBBk......',
    '.....kBBBBBBBBBBBBBBBBBBBBk.....',
    '.....kFBBBwkBBBBBBBBwkBBBFk.....',
    '.....kFFBBkkBBBBBBBBkkBBFFk.....',
    '.....kFFFFkkFffffffFkkFFFFk.....',
    '.....kFFFFFffffffffffFFFFFk.....',
    '......kFqqffffffffffffqqFk......',
    '......kFFffffbbffbbffffFFk......',
    '.....kkkFffffbbffbbffffFkkk.....',
    '....kBBBBBBBBBBBBBBBBBBBBBBk....',
    '....kBBBBggggggggggggggBBBBk....',
    '....kBBBBggggggggggggggBBBBk....',
    '...kBBBBBBBBBBggggBBBBBBBBBBk...',
    '...kBBBBBBBBBBggggBBBBBBBBBBk...',
    '...kBBBBBBBBBBBBBBBBBBBBBBBBk...',
    '...kBBBBBBBBBBBBBBBBBBBBBBBBk...',
    '..kBBBkkkBBBBBkBBBBBkBBBBkkBBk..',
    '..kBkk...kBBBk.kBBBkkkBBBk.kBk..',
    '...k....kbbbk...kBkkbbbBk...k...',
    '........kbbbk....k.kbbbk........',
    '.........kkk........kkk.........',
  ],
  unicorn: [
    '.................k.....kgk......',
    '................khk....kgk......',
    '................khk...kGgk......',
    '................khhk..kggk......',
    '..............kkkkhkkkGgk.......',
    '.............kgggghhuugguk......',
    '.............kgggghuuggguuk.....',
    '.............kggguuuuuuguuuk....',
    '............kgggguuuuuuuuuuuk...',
    '............kgLLNNuuuuwkuuuuuk..',
    '...........kNNLLLNuuuukkuuuuuk..',
    '...........kNLLLLuuuuukkuuuuuk..',
    '..........kNLLLLuuuuuuuuuuuuuuk.',
    '..........kNNLLkuuuuuuuqquuquuk.',
    '.........kNNNLNuuuuuuuuuuuuuuuk.',
    '......k.kuNNNNuuuuuuuuuuuUUUuuk.',
    '....kkNkuNuuuuuuuuuuuuuuuuuuuk..',
    '..kkNNNuuuuuuuuuuuuuuukkuuuuk...',
    '.kNNNLNuuuuuuuuuuuuuuuukkkkk....',
    '.kNNLLNuuuuuuuuuuuuuuuuk........',
    '.kNNLLLuuuuuuuuuuuuuuuuk........',
    'kNNLLLuuuuuuuuuuuuuuuuuk........',
    'kNNLLLkuuuuuuuuuuuuuuuk.........',
    'kNNNLk.kuuuuuuuuuuuuuk..........',
    '.kNNLk.kuuuuUUuUUuuuuk..........',
    '.kNNk..kuuuuUUuUUuuuuk..........',
    '..kNk..kuuukUUkUUkuuuk..........',
    '..kNk..kuuukUUkUUkuuuk..........',
    '...k...kuuukUUkUUkuuuk..........',
    '.......kgggkGGkGGkgggk..........',
    '.......kgggkGGkGGkgggk..........',
    '........kkk.kk.kk.kkk...........',
  ],
  dragon: [
    '.......k................k.......',
    '......kgk..............kgk......',
    '......kggk............kggk......',
    '.......kggk..kkkkkk..kggk.......',
    '.......kgggkkNNNNNNkkgggk.......',
    'k......kggNNNNNNNNNNNNggk......k',
    'Gk......kNNNNNNNNNNNNNNk......kG',
    'GGk....kNNNNNNNNNNNNNNNNk....kGG',
    'GGk...kNNNNNNNNNNNNNNNNNNk...kGG',
    'kgGk..kNNNwkNNNNNNNNwkNNNk..kGgk',
    'kgGGkkNNNNkkNNNNNNNNkkNNNNkkGGgk',
    'kGgGkkNNNNkkNNNNNNNNkkNNNNkkGgGk',
    'kGgGGkNNNNNNNLLLLLLNNNNNNNkGGgGk',
    '.kggGkNNqqNNLLLLLLLLNNqqNNkGggk.',
    '.kGgGGNNNNNLLLLLLLLLLNNNNNGGgGk.',
    '.kGgGGkNNNLLLnLLLLnLLLNNNkGGgGk.',
    'kGGGGGGNNNLLLLLLLLLLLLNNNGGGGGGk',
    'kGGGGGGkNNNLLLLLLLLLLNNNkGGGGGGk',
    'Gkkkkkk.kNNNLLwLLwLLNNNk.kkkkkkg',
    'k........kNNNLLLLLLNNNk.....kggg',
    '........kNNNNyyyyyyNNNNk.....kgk',
    '........kNNNyyyyyyyyNNNk.....kgk',
    '.......kNNNyggggggggyNNNk...kNk.',
    '.......kNNNyyyyyyyyyyNNNk...kNk.',
    '.......kNNNyyyyyyyyyyNNNkkkkNk..',
    '.......kNNNyggggggggyNNNkNNNNk..',
    '........kNNyyyyyyyyyyNNNNNNNk...',
    '........kNNNyyyyyyyyNNNNNNNNk...',
    '.........kNNNyyyyyyNNNNNNkkk....',
    '........knnnnNyyyyNnnnnkk.......',
    '........knnnnNNNNNNnnnnk........',
    '.........kkkkkkkkkkkkkk.........',
  ],
  knight: [
    '..............krkkk.............',
    '..............krrrrk............',
    '.............kkrrrrk............',
    '...........kkCCCCCCrk...........',
    '..........kCCCCCCCCCCk..........',
    '.........kCCCCCCCCCCCCk.........',
    '........kCCCCCCCCCCCCCCk........',
    '.......kCCCCCCCCCCCCCCCCk.......',
    '.......kCccccccccccccccCkk......',
    '......kCCccccccccccccccCCCk.....',
    '......kCCmmmmmmmmmmmmmmCCCk.....',
    '......kCCmmwkmmmmmmwkmmCCCk.....',
    '......kCCmmkkmmmmmmkkmmCCCk.....',
    '......kCCmmkkmmmmmmkkmmCCCk.....',
    '......kCCmmmmmmmmmmmmmmCCCk.....',
    '.......kCmqqmmmmmmmmqqmCCCk.....',
    '....kkkkCmmmmmMMMMmmmmmCCCk.....',
    '...kCCCCkmmmmmmmmmmmmmmkCCk.....',
    '..kCCCCCCkCCCCCCCCCCCCkkCCk.....',
    '.kCCCNNCCCnnnnnnnnnnnnnkCCk.....',
    '.kCCNggNCCnnnnnnnnnnnnnkCCkk....',
    'kCCNNggNNCCNNNggggNNNNGGGGGGk...',
    'kCCNNggNNCCNNNggggNNNNGGGGGGk...',
    'kCCNNggNNCCNNNggggNNNNNkkkkk....',
    'kCCNNggNNCCNNNggggNNNNNk........',
    '.kCCNggNCCNNNNggggNNNNNk........',
    '.kCCCNNCCCNNNNggggNNNNNk........',
    '..kCCCCCCNNNNNggggNNNNNk........',
    '...kCCCCkNNNNNNNNNNNNNNk........',
    '....kkkk.knnnnkkkknnnnk.........',
    '.........knnnnk..knnnnk.........',
    '..........kkkk....kkkk..........',
  ],
  mage: [
    '...............kpk..............',
    '..............kpppk.............',
    '..............kpppk.............',
    '.............kpPpppk............',
    '............kppPPpppk.....kk....',
    '...........kppPPgppppk...kLLk...',
    '...........kppPPggpppk..kLwLLk..',
    '..........kppPPPPPPpppkkLLLLLLk.',
    '.........kpppPpppppppppkLLLLLLk.',
    '........kpppppppppppppppkLLLLk..',
    '....kkkkkpppppppppppppppkkLLk...',
    '...kppppppppppppppppppppppook...',
    '...kpppppppppiiiiiipppppppook...',
    '...kppppppppiiiiiiiippppppook...',
    '....kkkkkkkiiiiiiiiiikkkkkook...',
    '.........kiwkiiiiiiwkik..kook...',
    '........kiikkiiiiiikkiik.kook...',
    '........kiikkiiiiiikkiik.kook...',
    '........kiiiiiiiiiiiiiik.kook...',
    '........kiQQiiiiiiiiQQik.kook...',
    '.........kiiiiIIIIiiiik..kook...',
    '.......kkkkiiiiiiiiiikkkkkook...',
    '......kppppppppggppppppppkook...',
    '......kppppppppggppppppppkook...',
    '.....kpppppppppggpppppppppook...',
    '.....kpppppppppggpppppppppook...',
    '.....kpppppppppggpppppppppook...',
    '....kppppppppppggpppppppppook...',
    '....kppppppppppggpppppppppook...',
    '...kpppppppppppggpppppppppook...',
    '...kpppppppppppggpppppppppook...',
    '....kkkkkkkkkkkkkkkkkkkkkkkk....',
  ],
  ranger: [
    '................................',
    '.............kkkkkk.............',
    '...........kkeeeeeekk...........',
    '..........keeeeeeeeeek..........',
    '.........keeeeeeeeeeeek.........',
    '........keeeeeeeeeeeeeek...kk...',
    '.......keeeeeeeeeeeeeeeek.kCok..',
    '......keeeeeeeeeeeeeeeeeekkCok..',
    '......keeeeeeeeeeeeeeeeeekkCook.',
    '.....keeeeeeeeeeeeeeeeeeeekCook.',
    '.....keeeeeeevvvvvveeeeeeekCook.',
    '.....keeeevvvvvvvvvvvveeeekCkook',
    '.....keeevvwkvvvvvvwkvveeekCkook',
    '.....keeevvkkvvvvvvkkvveeekCkook',
    '.....keeevvkkvvvvvvkkvveeekCkook',
    '.....keeevvvvvvvvvvvvvveeekCkook',
    '......keevqqvvvvvvvvqqveekkCkook',
    '......keeevvvvvvvvvvvveeekkCkook',
    '.......keevvvvVVVVvvvveek.kCkook',
    '.......kkeevvvvvvvvvveekk.kCkook',
    '......keeeeeeeeeeeeeeeeeekkCkook',
    '......keeeeeeeeeeeeeeeeeekkCkook',
    '......keeeeeeeeeeeeeeeeeekkCook.',
    '.....keeeeeeeeeeeeeeeeeeeekCook.',
    '.....keooooooooggooooooooekCook.',
    '.....keooooooooggooooooooekCok..',
    '.....keeeeeeeeeeeeeeeeeeeekCok..',
    '.....keeeeeeeeeeeeeeeeeeeekkk...',
    '....keeeeeeeeeeeeeeeeeeeeeek....',
    '....keeeeeooooeeeeooooeeeeek....',
    '....keeeeeooooeeeeooooeeeeek....',
    '.....kkkkkkkkkkkkkkkkkkkkkk.....',
  ],
  // STAFF ONLY (0020): the Legendary Golden Yak is filled in below from the yak grid (see goldenYak()).
  golden_yak: [],
};

/**
 * STAFF ONLY (0020): the Legendary Golden Yak. It is the regular yak pixel-for-pixel (same silhouette,
 * horns, fringe, snout, legs) recolored gold, with a little shading, shine and a gem on a royal collar.
 * Never offered to participants (see AVATAR_IDS vs LEGENDARY_AVATARS in src/lib/staffRewards.ts).
 */
function goldenYak(yak: string[]): string[] {
  const EYES = new Set(['10,13', '11,13', '20,13', '21,13', '10,14', '11,14', '20,14', '21,14', '10,15', '11,15', '20,15', '21,15']);
  const MAP: Record<string, string> = { k: 'd', B: 'j', F: 'l', f: 't', g: 'z' };
  const rows = yak.map((row, y) =>
    [...row].map((ch, x) => {
      if (ch === 'k' && EYES.has(`${x},${y}`)) return 'k'; // eyes stay dark so the face reads
      if (ch === 'b') return y >= 28 ? 'a' : 'k'; // hooves amber, nostrils dark
      return MAP[ch] ?? ch;
    }),
  );
  const put = (pts: [number, number][], ch: string) => pts.forEach(([x, y]) => (rows[y][x] = ch));
  // metallic shading: pale rim light on the left edge of the head and body, amber shadow on the right
  for (let y = 9; y <= 27; y++) {
    const r = rows[y];
    const first = r.findIndex((c) => c === 'j' || c === 'l');
    let last = -1;
    r.forEach((c, x) => (c === 'j' || c === 'l') && (last = x));
    if (first < 0) continue;
    if (r[first] === 'j') r[first] = 'l';
    if (y >= 11 && r[last] !== 't') r[last] = 'a';
  }
  // shine glints (top-left lit)
  put([[10, 8], [9, 9], [6, 21]], 't');
  put([[10, 7], [8, 10], [5, 21], [6, 20]], 'w');
  // gem tag on the royal collar (where the yak's bell tag hangs)
  put([[16, 23], [15, 24], [16, 24]], 'N');
  put([[15, 23]], 'w');
  return rows.map((r) => r.join(''));
}
GRIDS.golden_yak = goldenYak(GRIDS.yak);

export const AVATAR_NAMES: Record<AvatarId, string> = {
  yak: 'Yak',
  unicorn: 'Unicorn',
  dragon: 'Dragon',
  knight: 'Knight',
  mage: 'Mage',
  ranger: 'Ranger',
  golden_yak: 'Golden Yak',
};

/** Characters anyone can pick (sign-up, Me). The staff-only Golden Yak is NOT in this list. */
export const AVATAR_IDS: AvatarId[] = ['yak', 'unicorn', 'dragon', 'knight', 'mage', 'ranger'];

export function Sprite({ id, size = 48, className, title }: { id: AvatarId | 'chest' | 'trophy'; size?: number; className?: string; title?: string }) {
  const grid = id === 'chest' ? CHEST : id === 'trophy' ? TROPHY : GRIDS[id] ?? GRIDS.yak;
  // Merge runs of the same color in each row into one strip (far fewer SVG nodes).
  const rects: JSX.Element[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const fill = PALETTE[ch];
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x + 0.02} height={1.02} fill={fill} />);
      x = end;
    }
  });
  return (
    <svg
      viewBox={`0 0 ${grid[0].length} ${grid.length}`}
      width={size}
      height={size}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title ?? (id in AVATAR_NAMES ? AVATAR_NAMES[id as AvatarId] : id)}
    >
      {rects}
    </svg>
  );
}

const CHEST = [
  '................',
  '................',
  '...kkkkkkkkkk...',
  '..kGGGGGGGGGGk..',
  '.kGggggggggggGk.',
  '.kGbbbbbbbbbbGk.',
  '.kbBBBBBBBBBBbk.',
  '.kkkkkkggkkkkkk.',
  '.kGbbbkgGkbbbGk.',
  '.kGBBBkGGkBBBGk.',
  '.kGBBBBkkBBBBGk.',
  '.kGBBBBBBBBBBGk.',
  '.kGbbbbbbbbbbGk.',
  '.kkkkkkkkkkkkkk.',
  '................',
  '................',
];

const TROPHY = [
  '................',
  '..kkkkkkkkkkkk..',
  '.kgkggggggggkgk.',
  '.kgkgwgggggGkgk.',
  '.kgkgwgggggGkgk.',
  '..kkgggggggGkk..',
  '....kgggggGk....',
  '.....kgggGk.....',
  '......kgGk......',
  '......kgGk......',
  '.....kggGGk.....',
  '....knnnnnnk....',
  '....knNNNNnk....',
  '...knnnnnnnnk...',
  '...kkkkkkkkkk...',
  '................',
];

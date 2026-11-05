/**
 * 16×16 badge emblems: a round medallion (ring + fill color) with a 10×10 symbol in the middle.
 * Chars come from the Sprite palette + EXTRA_PALETTE ('.' = transparent).
 */
export interface BadgeArt {
  ring: string;
  fill: string;
  symbol: string[];
}

export const BADGE_ART: Record<string, BadgeArt> = {
  first_checkin: {
    ring: 'e',
    fill: 'E',
    symbol: [
      '......b.b.',
      '.....b.b.b',
      '......bbb.',
      '.b.b..bbbb',
      'b.b.b.bbbb',
      '.bbb...bb.',
      '.bbbb.....',
      '.bbbb.....',
      '..bb......',
      '..........',
    ],
  },
  regular: {
    ring: 'N',
    fill: 'L',
    symbol: [
      '..........',
      'kkkkkkkkkk',
      'kggggggggk',
      '.kgkkkkgk.',
      '.kgkgggGk.',
      'kggkkkgGgk',
      'kgggggkGgk',
      '.kgkkkgGk.',
      'kkkkkkkkkk',
      '..........',
    ],
  },
  veteran: {
    ring: 'p',
    fill: 'v',
    symbol: [
      'kkkkkkkkkk',
      'knnnnnnnnk',
      'knngngggnk',
      'knggngngnk',
      'knngngngnk',
      'knngngngnk',
      'knngngggnk',
      '.knnnnnnk.',
      '..knnnnk..',
      '...kkkk...',
    ],
  },
  explorer: {
    ring: 'e',
    fill: '0',
    symbol: [
      '....kk....',
      '...krrk...',
      '..kwrrwk..',
      '.kwwrrwwk.',
      'kwwwkkwwwk',
      'kwwwkkwwwk',
      '.kwwnnwwk.',
      '..kwnnwk..',
      '...knnk...',
      '....kk....',
    ],
  },
  big_moment: {
    ring: 'g',
    fill: 'n',
    symbol: [
      '.....kkkk.',
      '....kyyyk.',
      '...kyyyk..',
      '..kyyyk...',
      '.kyyyykkk.',
      '.kkkyyyyk.',
      '...kyyyk..',
      '..kyyk....',
      '..kyk.....',
      '..kk......',
    ],
  },
  seasons: {
    ring: 'Q',
    fill: 'i',
    symbol: [
      '.k..k..k..',
      'krkrkrkrk.',
      'krrrrrrrk.',
      'kwwwwwwwk.',
      'kwkwkwkwk.',
      'kwwwwwwwk.',
      'kwkwkwkwk.',
      'kwwwwwwwk.',
      'kkkkkkkkk.',
      '..........',
    ].map((r) => '.' + r.slice(0, 9)),
  },
  digital: {
    ring: 'M',
    fill: 'm',
    symbol: [
      '..kkkkkk..',
      '..knnnnk..',
      '..kLLLLk..',
      '..kLqLqk..',
      '..kqqqqk..',
      '..kLqqLk..',
      '..kLLqLk..',
      '..kLLLLk..',
      '..knnwnk..',
      '..kkkkkk..',
    ],
  },
  shutterbug: {
    ring: 'O',
    fill: 'y',
    symbol: [
      '..........',
      '..kkk..kk.',
      '.kcccckrrk',
      'kcccckkkck',
      'kcckwNNkck',
      'kckNLNNNkk',
      'kckNNNnNkk',
      'kcckNnnkck',
      'kccckkkcck',
      '.kkkkkkkk.',
    ],
  },
  recruiter: {
    ring: 'B',
    fill: 'h',
    symbol: [
      '..........',
      '.kk....kk.',
      'kssk..kssk',
      'kssk..kssk',
      '.kk....kk.',
      'kNNk..keek',
      'NNNNkkeeee',
      'NNNNkqeeee',
      'NNNNkkeeee',
      '..........',
    ],
  },
  giver: {
    ring: 'I',
    fill: 'i',
    symbol: [
      '..........',
      '.kk...kk..',
      'kqwqk.kqqk',
      'kwqqqkqqQk',
      'kqqqqqqqQk',
      '.kqqqqqQk.',
      '..kqqqQk..',
      '...kqQk...',
      '....kk....',
      '..........',
    ],
  },
  champion: {
    ring: 'g',
    fill: 'N',
    symbol: [
      '.kkkkkkkk.',
      'kgkyggGkgk',
      'kgkyggGkgk',
      '.kkyggGkk.',
      '..kyggGk..',
      '...kgGk...',
      '...kgGk...',
      '...kgGk...',
      '..kGGGGk..',
      '..kkkkkk..',
    ],
  },
  voice: {
    ring: 'V',
    fill: 'U',
    symbol: [
      '..........',
      '.kkkkkkkk.',
      'kwwwwwwwwk',
      'kwwwwwwwwk',
      'kwnwwnwwnk',
      'kwwwwwwwwk',
      '.kkwkkkkk.',
      '..kwk.....',
      '..kk......',
      '..........',
    ],
  },
  halfway: {
    ring: 'L',
    fill: '0',
    symbol: [
      '...kkkkk..',
      '...krrrrk.',
      '...krrrrrk',
      '...krrrrk.',
      '...kkkkk..',
      '...k......',
      '...k......',
      '..2k2.....',
      '.22322....',
      '2223222...',
    ],
  },
  legend: {
    ring: 'g',
    fill: 'p',
    symbol: [
      '....kk....',
      '....kyk...',
      '...kyyk...',
      'kkkkyygkkk',
      'kyyyyyggGk',
      '.kgyyyggk.',
      '..kgygGk..',
      '.kgGkkgGk.',
      '.kGk..kGk.',
      '.kk....kk.',
    ],
  },
  monthly_star: {
    ring: 'G',
    fill: 'n',
    symbol: [
      '....kk....',
      '...kyyk...',
      '.kkkyggkk.',
      'kyyyyggGGk',
      '.kggggGGk.',
      '..kgkkGk..',
      'kkkkkkkkkk',
      'krrrrrrrrk',
      '.krrkkrrk.',
      '..kk..kk..',
    ],
  },
};

/** The medallion shape: 'k' outline, 'R' ring, 'F' fill, 'S' shine, '.' outside. */
const MEDALLION = [
  '.....kkkkkk.....',
  '...kkRRRRRRkk...',
  '..kRRSSSRRRRRk..',
  '.kRSRFFFFFFRRRk.',
  '.kRSFFFFFFFFRRk.',
  'kRRFFFFFFFFFFRRk',
  'kRRFFFFFFFFFFRRk',
  'kRRFFFFFFFFFFRRk',
  'kRRFFFFFFFFFFRRk',
  'kRRFFFFFFFFFFRRk',
  'kRRFFFFFFFFFFRRk',
  '.kRRFFFFFFFFRRk.',
  '.kRRRFFFFFFRRRk.',
  '..kRRRRRRRRRRk..',
  '...kkRRRRRRkk...',
  '.....kkkkkk.....',
];
export const medallion = () => MEDALLION;

/** Full 16×16 grid for a badge. */
export function badgeGrid(id: string): string[] {
  const art = BADGE_ART[id] ?? BADGE_ART.first_checkin;
  const rows = medallion().map((r) => [...r].map((c) => (c === 'R' ? art.ring : c === 'F' ? art.fill : c === 'S' ? 'w' : c)));
  art.symbol.forEach((row, dy) =>
    [...row].forEach((ch, dx) => {
      if (ch !== '.') rows[3 + dy][3 + dx] = ch;
    }),
  );
  return rows.map((r) => r.join(''));
}

/** Little padlock drawn over locked badges (bottom-right). */
export const LOCK = ['.kkk.', 'k...k', 'kkkkk', 'kgggk', 'kgkgk', 'kkkkk'];

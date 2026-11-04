import type { AvatarId } from '../types';

/**
 * 16x16 pixel sprites drawn from text grids. Each character maps to a color in the palette.
 * '.' is transparent. Add a new character by adding a grid + palette entry.
 */
const PALETTE: Record<string, string> = {
  k: '#14213d',
  w: '#ffffff',
  b: '#8a5a36',
  B: '#c48650',
  F: '#e0aa72',
  h: '#fff3d6',
  H: '#e9cf96',
  g: '#f2b33d',
  G: '#c98a12',
  n: '#0b2a5b',
  N: '#2f6fd6',
  L: '#8fc1ff',
  s: '#f6cfa8',
  S: '#e5a982',
  r: '#d64545',
  p: '#8a4fd8',
  P: '#c4a0f5',
  e: '#2fa36b',
  E: '#8be0b0',
  c: '#9aa5b8',
  C: '#e3e9f3',
  q: '#ff9fb8',
  u: '#f4f1ff',
  U: '#d9d3f5',
  y: '#ffe9a8',
};

const GRIDS: Record<AvatarId, string[]> = {
  yak: [
    '................',
    '.hh..........hh.',
    '.Hhh........hhH.',
    '..Hhkkkkkkkkhh..',
    '...kFFFFFFFFk...',
    '..kFFFFFFFFFFk..',
    '..kFwkFFFFwkFk..',
    '..kFkkFFFFkkFk..',
    '..kqFFFFFFFFqk..',
    '..kBFkhhhhkFBk..',
    '...kBkhkkhkBk...',
    '..kBBBkhhkBBBk..',
    '.kBBgggggggBBBk.',
    '.kBBBBBgBBBBBBk.',
    '..kBk.kBBk.kBk..',
    '...k...kk...k...',
  ],
  unicorn: [
    '........g.......',
    '.......gG.......',
    '...k...gk...k...',
    '..kUk.kgGk.kUk..',
    '..kuukkkkkkuuk..',
    '.kNuuuuuuuuuuk..',
    '.kNuwkuuuuwkuk..',
    'kNLukkuuuukkuk..',
    'kNNuquuuuuuqUk..',
    'kNLuuuUUUUuuUk..',
    '.kNkuUkUUkUuk...',
    '.kNNkuuuuuuk....',
    '..kkuuuuuuuuk...',
    '...kugggggguk...',
    '...kuk.kuk.kuk..',
    '....k...k...k...',
  ],
  dragon: [
    '................',
    '...gk......kg...',
    '...kgk....kgk...',
    '....kkkkkkkk....',
    '...kNNNNNNNNk...',
    'gk.kNNNNNNNNNk..',
    'ggkNNwkNNNwkNk..',
    'kgkNNkkNNNkkNk..',
    '.kkNqNNNNNNqNk..',
    '..kNNNkNkNNNk...',
    '...kNNNNNNNNk...',
    '..kNNyyyyyyNNk..',
    '.kNNNyyyyyyNNNkk',
    '.kNNNNyyyyNNNkNk',
    '..kNk.kNNk.kNkk.',
    '...k...kk...k...',
  ],
  knight: [
    '................',
    '......kgk.......',
    '.....kkgkk......',
    '....kCCCCCk.....',
    '...kCCCCCCCk....',
    '..kCkkkkkkkCk...',
    '..kCkswssswkCk..',
    '..kCkskssksCk...',
    '..kCkqssssqCk...',
    '...kCCkkkkCCk...',
    '..knnNNggNNnnk..',
    '.kCknNNggNNnkCk.',
    '.kCknnNNNNnnkCk.',
    '..k.kGgggggGk.k.',
    '....knnk.knnk...',
    '....kkk...kkk...',
  ],
  mage: [
    '.......kk.......',
    '......kPPk......',
    '.....kPgPPk.....',
    '....kPPPPPPk....',
    '...kPPPPPPPPk...',
    '.kkkkkkkkkkkkkk.',
    '...kssssssssk...',
    '...kswksswksk...',
    '...kskksskksk...',
    '...kqssssssqk...',
    '....kssssssk....',
    '...kpgpppgpk.g..',
    '..kpppgggpppkgk.',
    '..kppppppppp.k..',
    '...kpk.kpk.kpk..',
    '...kk...k...kk..',
  ],
  ranger: [
    '................',
    '.....kkkkkk.....',
    '....keeEEeek....',
    '...keeeEEeeek...',
    '..keeeeeeeeeek..',
    '..kekssssssk.k..',
    '...kswksswksk...',
    '...kskksskksk...',
    '...kqssssssqk...',
    '....kssSSssk....',
    '...keeeeeeeek...',
    '..keEeeggeeEek..',
    '.kseeeeggeeeesk.',
    '..kkeeeeeeeekk..',
    '....kbk..kbk....',
    '....kkk..kkk....',
  ],
};

export const AVATAR_NAMES: Record<AvatarId, string> = {
  yak: 'Yak',
  unicorn: 'Unicorn',
  dragon: 'Dragon',
  knight: 'Knight',
  mage: 'Mage',
  ranger: 'Ranger',
};

export const AVATAR_IDS = Object.keys(GRIDS) as AvatarId[];

export function Sprite({ id, size = 48, className, title }: { id: AvatarId | 'chest' | 'trophy'; size?: number; className?: string; title?: string }) {
  const grid = id === 'chest' ? CHEST : id === 'trophy' ? TROPHY : GRIDS[id] ?? GRIDS.yak;
  const rects: JSX.Element[] = [];
  grid.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const fill = PALETTE[ch];
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />);
    }),
  );
  return (
    <svg
      viewBox="0 0 16 16"
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

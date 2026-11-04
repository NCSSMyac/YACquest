import type { AvatarId } from '../types';

/**
 * 16x16 pixel sprites drawn from text grids. Each character maps to a color in the palette.
 * '.' is transparent. Add a new character by adding a grid + palette entry.
 */
const PALETTE: Record<string, string> = {
  k: '#14213d', // outline
  w: '#ffffff',
  b: '#7a4a2a', // yak fur dark
  B: '#a8693c', // yak fur light
  h: '#f3e6c8', // horn
  g: '#f2b33d', // gold
  G: '#c98a12',
  n: '#0b2a5b', // navy
  N: '#2f6fd6',
  s: '#f1c7a1', // skin
  r: '#d64545',
  p: '#8a4fd8',
  P: '#b58bf0',
  e: '#2fa36b',
  E: '#7fd3a5',
  c: '#9aa5b8', // steel
  C: '#d7deea',
};

const GRIDS: Record<AvatarId, string[]> = {
  yak: [
    '................',
    '..hh........hh..',
    '..hkh......hkh..',
    '...hkkkkkkkkh...',
    '...kBBBBBBBBk...',
    '..kBBwkBBkwBBk..',
    '..kBBkkBBkkBBk..',
    '..kbBBBBBBBBbk..',
    '..kbbBkkkkBbbk..',
    '..kbbkhhhhkbbk..',
    '...kbbkkkkbbk...',
    '..knnbbbbbbnnk..',
    '.knggnnnnnnggnk.',
    '.kbnnnnggnnnnbk.',
    '..kbk.kbbk.kbk..',
    '...k...kk...k...',
  ],
  knight: [
    '................',
    '.....kkkkkk.....',
    '....kccccCCk....',
    '...kcCCCCCCck...',
    '...kckkkkkkck...',
    '...kckwkkwkck...',
    '...kccccccccck..',
    '....kcccccck....',
    '...knnnggnnnk...',
    '..knNNnggnNNnk..',
    '.kcknNNggNNnkck.',
    '.kckknnnnnnkkck.',
    '..k.kgggggGk.k..',
    '....knnkknnk....',
    '....kcck.kcck...',
    '....kkkk.kkkk...',
  ],
  mage: [
    '.......kk.......',
    '......kPPk......',
    '.....kpPPpk.....',
    '....kppgPppk....',
    '...kpppppppk....',
    '..kkkkkkkkkkkk..',
    '....kssssssk....',
    '....kskssksk....',
    '....kssssssk....',
    '...kpwwwwwwpk...',
    '..kpppwwwwpppk..',
    '.kspppppppppppk.',
    '..kpppPPPPpppk..',
    '...kppppppppk...',
    '...kpk....kpk...',
    '...kk......kk...',
  ],
  ranger: [
    '................',
    '.....kkkkkk.....',
    '....keeEEeek....',
    '...keeeEEeeek...',
    '...kekssssk.k...',
    '...kkskssksk....',
    '....kssssssk....',
    '.....kssssk.....',
    '...keeeeeeeek...',
    '..keEeeggeeEek..',
    '.kseeeeggeeeesk.',
    '.kskeeeeeeeeksk.',
    '..k.kbbbbbbk.k..',
    '....kekkkkek....',
    '....kbk..kbk....',
    '....kkk..kkk....',
  ],
};

export const AVATAR_NAMES: Record<AvatarId, string> = {
  yak: 'Yak',
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

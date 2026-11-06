/**
 * Pixel art for wardrobe cosmetics (hats + accessories) and where they sit on each character.
 * Grids use the Sprite palette chars (see PALETTE in ../Sprite.tsx) plus EXTRA_PALETTE below.
 * '.' is transparent. Coordinates are in the 32×32 character grid.
 */
import type { AvatarId } from '../../types';
import { GRIDS } from '../Sprite';

/** Extra colors used by cosmetics/backgrounds (chars unused by the characters). */
export const EXTRA_PALETTE: Record<string, string> = {
  '0': '#bfe3ff', // sky
  '1': '#e4f4ff', // pale sky
  '2': '#7cc56b', // grass
  '3': '#4f9e57', // dark grass
  '4': '#ffd27a', // sunset gold
  '5': '#ffa36b', // sunset orange
  '6': '#f27a86', // sunset coral
  '7': '#b866b0', // sunset magenta
  '8': '#6c4fb0', // sunset violet
  '9': '#fff1b0', // sun
  D: '#071a3a', // deep night
  A: '#13306b', // night blue
  K: '#3b2f63', // silhouette
  J: '#5a4a8c', // silhouette light
  O: '#f39c3b', // orange
  T: '#8a5a12', // dark coin shadow
  Z: '#3a2414', // cave
  W: '#5c3a1e', // cave light
  R: '#a3282a', // deep red (Hero's Cape, staff-only art)
};

export interface Art {
  grid: string[];
  /** Rows to push the art down past the anchor (e.g. a crown band sits lower on the head). */
  sink?: number;
}

export const HAT_ART: Record<string, Art> = {
  party_hat: {
    grid: [
      '....g....',
      '...gyg...',
      '....g....',
      '...kIk...',
      '...kwk...',
      '..kIwIk..',
      '..kwIwk..',
      '.kIIwIIk.',
      '.kwwIwwk.',
      'kIIIwIIIk',
      'kkkkkkkkk',
    ],
    sink: 1,
  },
  flower_crown: {
    grid: [
      '.kk...kk...kk.',
      'kqqk.kyyk.kIIk',
      'kqyqkeyGeekIyI',
      'ekqkeekkeeekIk',
      '.eeEeeEeeEeee.',
    ],
    sink: 2,
  },
  explorer_cap: {
    grid: [
      '....kkkkk....',
      '...kfFFFfk...',
      '..kfFFFFFFk..',
      '..kFFFFFFFk..',
      '..kbbbbbbbk..',
      'kkFFFFFFFFFkk',
      'kFFFFFFFFFFFk',
      '.kkkkkkkkkkk.',
    ],
    sink: 2,
  },
  wizard_hat: {
    grid: [
      '........kk..',
      '.......kNNk.',
      '......kNNk..',
      '.....kNNNk..',
      '.....kNyNk..',
      '....kNyyyNk.',
      '....kNNyNNk.',
      '...kNNNNNNNk',
      '...kNNNNyNNk',
      '..kggggggggk',
      'kkNNNNNNNNNNk',
      '.kkkkkkkkkkk.',
    ].map((r) => r.padEnd(13, '.')),
    sink: 2,
  },
  crown: {
    grid: [
      '.k...k...k.',
      'kyk.kyk.kyk',
      'kgkkkgkkkgk',
      'kgggggggggk',
      'kgrgyNygrgk',
      'kGGGGGGGGGk',
      'kkkkkkkkkkk',
    ],
    sink: 2,
  },
};

export const ACCESSORY_ART: Record<string, Art> = {
  bowtie: {
    grid: [
      'kk...kk',
      'krkkkrk',
      'krrQrrk',
      'krkkkrk',
      'kk...kk',
    ],
  },
  pearls: {
    grid: [
      'k...........k',
      'wk.........kw',
      'kwk.......kwk',
      '.kwkk...kkwk.',
      '..kwkwkwkwk..',
      '...kk.I.kk...',
      '.....kIk.....',
      '......k......',
    ],
  },
  medal: {
    grid: [
      'kNk...krk',
      '.kNk.krk.',
      '..kNkrk..',
      '...kGk...',
      '..kgggk..',
      '.kgyggGk.',
      '.kggrgGk.',
      '.kgggGGk.',
      '..kGGGk..',
      '...kkk...',
    ],
  },
  gold_chain: {
    grid: [
      'g...........g',
      'Gk.........kG',
      'kgk.......kgk',
      '.kGkk...kkGk.',
      '..kgGgGgGgk..',
      '...kkkgkkk...',
      '....kgygk....',
      '....kGgGk....',
      '.....kkk.....',
    ],
  },
};

/** Sparkle aura: twinkling stars placed around the character (frame coords, 32×32 grid). */
const SPARK_BIG = ['..g..', '..y..', 'gywyg', '..y..', '..g..'];
const SPARK_SMALL = ['.g.', 'gwg', '.g.'];
export const SPARKLES: { grid: string[]; x: number; y: number; delay: number }[] = [
  { grid: SPARK_BIG, x: -1, y: -3, delay: 0 },
  { grid: SPARK_SMALL, x: 28, y: 3, delay: 0.4 },
  { grid: SPARK_BIG, x: 28, y: 15, delay: 0.8 },
  { grid: SPARK_SMALL, x: 0, y: 17, delay: 0.2 },
  { grid: SPARK_SMALL, x: 26, y: -3, delay: 0.6 },
  { grid: SPARK_SMALL, x: 2, y: 8, delay: 1.0 },
];

/** Where a hat's bottom-center lands (x = center column, y = bottom row before sink). */
export const HAT_ANCHOR: Record<AvatarId, { x: number; y: number }> = {
  yak: { x: 16, y: 5 },
  golden_yak: { x: 16, y: 6 },
  unicorn: { x: 18, y: 4 },
  dragon: { x: 16, y: 4 },
  knight: { x: 16, y: 4 },
  mage: { x: 16, y: 9 },
  ranger: { x: 16, y: 2 },
};

/** Where an accessory's top-center lands. */
export const NECK_ANCHOR: Record<AvatarId, { x: number; y: number }> = {
  yak: { x: 16, y: 20 },
  golden_yak: { x: 16, y: 20 },
  unicorn: { x: 20, y: 17 },
  dragon: { x: 16, y: 19 },
  knight: { x: 16, y: 18 },
  mage: { x: 16, y: 21 },
  ranger: { x: 16, y: 20 },
};

/** Per character × item nudges, for the few spots that need it. */
const NUDGE: Partial<Record<AvatarId, Record<string, { x?: number; y?: number }>>> = {};

export function nudge(id: AvatarId, item: string) {
  return NUDGE[id]?.[item] ?? {};
}

// Mage wears a wizard hat already; with another hat equipped we show the mage with white hair instead.
const MAGE_HAIR: Record<number, string> = {
  9: '...........kkkkkkkkkk..',
  10: '..........khhhhhhhhhhk.',
  11: '.........khhhhhhhhhhhhk',
  12: '.........khhHhhhhhhHhhk',
  13: '.........khhhiiiiiihhhk',
  14: '.........khhiiiiiiiihhk',
};

let mageBare: string[] | null = null;
/** The mage without the wizard hat (keeps the staff + orb). */
export function mageWithoutHat(): string[] {
  if (mageBare) return mageBare;
  const src = GRIDS.mage;
  mageBare = src.map((row, y) => {
    if (y > 14) return row;
    const left = (MAGE_HAIR[y] ?? '').padEnd(23, '.');
    let right = row.slice(23).replace(/[pPg]/g, '.');
    if (y >= 11 && right[2] === '.') right = right.slice(0, 2) + 'k' + right.slice(3);
    return left + right;
  });
  return mageBare;
}

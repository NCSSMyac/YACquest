/**
 * STAFF-ONLY pixel art (0020): Council wardrobe hats/accessories, Hero of the Week perks and the
 * Council badge emblems. Same conventions as art.ts / badgeArt.ts (Sprite palette + EXTRA_PALETTE,
 * '.' transparent, 32×32 character coordinates). Backgrounds live in backgrounds.ts with the others.
 */
import type { AvatarId } from '../../types';
import type { Art } from './art';
import type { BadgeArt } from './badgeArt';

/** Where an accessory sits: 'neck' (default, NECK_ANCHOR), 'eye' (over the viewer's-right eye), 'side' (held at the left side). */
export type StaffAnchor = 'neck' | 'eye' | 'side';

export const STAFF_HAT_ART: Record<string, Art> = {
  host_top_hat: {
    grid: [
      '..kkkkkkkk...',
      '..kJKKKKKk...',
      '..kJKKKKKk...',
      '..kJKKKKKk...',
      '..kJKKKKKk...',
      '..krrrryrk...',
      '..kJKKKKKk...',
      'kkkJKKKKKkkk.',
      'kJJKKKKKKKKKk',
      '.kkkkkkkkkkk.',
    ].map((r) => r.slice(0, 12)),
    sink: 2,
  },
  wizard_council_hat: {
    grid: [
      '..........kk.',
      '.........kPpk',
      '........kPpk.',
      '.......kPppk.',
      '......kPpppk.',
      '.....kPpyppk.',
      '.....kPyppppk',
      '....kPpyyppk.',
      '....kPppyppgk',
      '...kPpppppppk',
      '...kggygggygk',
      'kkkpppppppppkk',
      'kPPpppppppppppk',
      '.kkkkkkkkkkkkk.',
    ].map((r) => r.padEnd(15, '.')),
    sink: 2,
  },
  hero_crown: {
    grid: [
      '......k......',
      '.....kwk.....',
      '..k..kyk..k..',
      '.kwk.kgk.kwk.',
      '.kgkkgggkkgk.',
      'kgggggggggggk',
      'kyNyyrrryyNyk',
      'kGGGGGGGGGGGk',
      'kwkwwkwkwwkwk',
      '.kkkkkkkkkkk.',
    ],
    sink: 3,
  },
};

export const STAFF_ACCESSORY_ART: Record<string, Art & { anchor?: StaffAnchor }> = {
  gatekeeper_monocle: {
    anchor: 'eye',
    grid: [
      '.kkkk..',
      'kgggGk.',
      'kw..gk.',
      'kg..gk.',
      'kgggGk.',
      '.kkkkG.',
      '.....G.',
      '....G..',
      '....G..',
      '.....G.',
    ],
  },
  heralds_horn: {
    grid: [
      '...........kk.',
      '..........kygk',
      'kk.kkkkkkkkygk',
      'kgkgggggggggyk',
      'kk.kkkkkkkkygk',
      '...kNrNrNk.kygk',
      '...kNrNrNk..kk.',
      '...kNkNkNk.....',
    ].map((r) => r.padEnd(15, '.')),
  },
  royal_scepter: {
    anchor: 'side',
    grid: [
      '..y..',
      '.kwk.',
      'ykNLk',
      '.kNNk',
      '..kk.',
      '.kgk.',
      '.kyk.',
      '.kGk.',
      '.kgk.',
      '.kGk.',
      '.kgk.',
      '.kGk.',
      '.kgk.',
      '.kGk.',
      '.kkk.',
    ].map((r) => r.slice(0, 5)),
  },
  hero_cape: {
    grid: [
      '..kkkkkkkkkkkkkkkkkk..',
      '.kwwkwwwkwwwwkwwwkwwk.',
      'krrrrrrRkkgykkRrrrrrrk',
      'krrrrrRk......kRrrrrrk',
      'krrrrRk........kRrrrrk',
      'krrrrRk........kRrrrrk',
      'krrrRk..........kRrrrk',
      'kgggk............kgggk',
      '.kkk..............kkk.',
    ],
  },
};

/** Center-ish top-left of the viewer's-right eye (2×2) for each character. */
export const EYE_ANCHOR: Record<AvatarId, { x: number; y: number }> = {
  yak: { x: 20, y: 13 },
  golden_yak: { x: 20, y: 13 },
  unicorn: { x: 22, y: 9 },
  dragon: { x: 20, y: 9 },
  knight: { x: 19, y: 11 },
  mage: { x: 19, y: 15 },
  ranger: { x: 19, y: 12 },
};

/** Top of a held item (scepter), left side of the character. */
export const SIDE_ANCHOR: Record<AvatarId, { x: number; y: number }> = {
  yak: { x: 0, y: 12 },
  golden_yak: { x: 0, y: 12 },
  unicorn: { x: 0, y: 10 },
  dragon: { x: 1, y: 13 },
  knight: { x: 0, y: 10 },
  mage: { x: 1, y: 13 },
  ranger: { x: 1, y: 13 },
};

/** Council badge emblems (16×16 medallion + 10×10 symbol, see badgeGrid()). */
export const STAFF_BADGE_ART: Record<string, BadgeArt> = {
  gatekeeper: {
    ring: 'c',
    fill: 'C',
    symbol: [
      '...kkkk...',
      '..kGggGk..',
      '.kG.kk.Gk.',
      '.kg.kk.gk.',
      '.kg....gk.',
      '.kgkkkkgk.',
      '.kgkyykgk.',
      '.kgkyykgk.',
      '.kgkkkkgk.',
      '.kkkkkkkk.',
    ],
  },
  town_crier: {
    ring: 'r',
    fill: 'i',
    symbol: [
      '.......kk.',
      '......kygk',
      '.kkkkkkygk',
      'kgggggggyk',
      '.kkkkkkygk',
      '..k...kygk',
      '.k.k...kk.',
      '..........',
      '.k.k.k....',
      '..........',
    ],
  },
  event_host: {
    ring: 'p',
    fill: 'v',
    symbol: [
      '..kkkkkk..',
      '..kKKKKk..',
      '..kKKKKk..',
      '..kKKKKk..',
      '..krryrk..',
      'kkkKKKKkkk',
      'kKKKKKKKKk',
      '.kkkkkkkk.',
      '..y....y..',
      '.yyy..yyy.',
    ],
  },
  hero_week: {
    ring: 'r',
    fill: '9',
    symbol: [
      '....kk....',
      '...kyyk...',
      '..kyggyk..',
      'kkkyggykkk',
      'kyyggggyyk',
      '.kgggggGk.',
      '..kgggGk..',
      '.kgGkkgGk.',
      '.kGk..kGk.',
      '.kk....kk.',
    ],
  },
  council_legend: {
    ring: 'G',
    fill: 'K',
    symbol: [
      'k...kk...k',
      'kyk.kk.kyk',
      'kgykyykygk',
      'kggggggggk',
      'kgrgyNygrk',
      'kGGGGGGGGk',
      '.kkkkkkkk.',
      '..y....y..',
      '.yyy..yyy.',
      '..y....y..',
    ],
  },
};

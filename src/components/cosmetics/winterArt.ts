/**
 * 0035 WINTER seasonal wardrobe: registry for the art in winterVec.ts. Every piece is drawn as vector art;
 * the small grids below are only the pixel fallback (flatten(), tests), like limitedArt.ts.
 * The New Year's Party Hat shows the year of the New Year it celebrates (newYearHatYear()), so it is
 * looked up through newYearHatArt() (art.ts exposes it as a getter on HAT_ART).
 */
import type { Art } from './art';
import type { SeasonalArt } from './seasonalArt';
import { newYearHatYear } from '../../lib/seasonal';
import {
  CANDY_CANE_VEC, DREIDEL_VEC, FESTIVAL_OF_LIGHTS_VEC, HOLIDAY_HAT_VEC, KINARA_GLOW_VEC, LANTERNS_FIREWORKS_VEC, LONGEST_NIGHT_VEC,
  MIDNIGHT_FIREWORKS_VEC, PARTY_POPPER_VEC, RED_ENVELOPE_VEC, ROSCA_VEC, SNOWY_PINE_VEC, STARLIGHT_LANTERN_VEC, newYearHat,
  KWANZAA_SCARF_VEC, UNITY_CUP_VEC, ZAWADI_VEC,
} from './winterVec';
import type { VecArt } from './vector';

/** A w×h outlined block of one palette color (pixel fallback only). */
function block(w: number, h: number, fill: string): string[] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (y === 0 || y === h - 1 || x === 0 || x === w - 1 ? 'k' : fill)).join(''),
  );
}

export const WINTER_HAT_ART: Record<string, Art> = {
  holiday_hat: { grid: block(19, 15, 'r'), sink: 4, vec: HOLIDAY_HAT_VEC },
};

const nyCache = new Map<number, Art>();
/** The party hat for the New Year being celebrated (2027 during the 2026–27 window, 2028 for the next). */
export function newYearHatArt(at: Date | number = Date.now()): Art {
  const year = newYearHatYear(at);
  let a = nyCache.get(year);
  if (!a) {
    a = { grid: block(13, 14, 'b'), sink: 4, vec: newYearHat(year) };
    nyCache.set(year, a);
  }
  return a;
}

export const WINTER_ACCESSORY_ART: Record<string, SeasonalArt> = {
  dreidel: { grid: block(12, 15, 'b'), anchor: 'side', sink: 4, vec: DREIDEL_VEC },
  candy_cane: { grid: block(11, 16, 'w'), anchor: 'side', sink: 3, vec: CANDY_CANE_VEC },
  starlight_lantern: { grid: block(11, 14, 'y'), anchor: 'side', sink: 4, vec: STARLIGHT_LANTERN_VEC },
  party_popper: { grid: block(14, 17, 'y'), anchor: 'side', sink: 4, vec: PARTY_POPPER_VEC },
  red_envelope: { grid: block(12, 15, 'r'), anchor: 'side', sink: 5, vec: RED_ENVELOPE_VEC },
  // 0036 Kwanzaa: unity cup + zawadi held at the side; the scarf is worn at the neck
  kikombe_cha_umoja: { grid: block(12, 15, 'B'), anchor: 'side', sink: 4, vec: UNITY_CUP_VEC },
  zawadi: { grid: block(12, 15, 'w'), anchor: 'side', sink: 2, vec: ZAWADI_VEC },
  kwanzaa_scarf: { grid: block(14, 11, 'r'), anchor: 'neck', sink: 0, vec: KWANZAA_SCARF_VEC },
};

const solid = (ch: string) => () => Array.from({ length: 36 }, () => Array.from({ length: 36 }, () => ch));

/** Pixel fallbacks (one night color each). */
export const WINTER_BACKGROUNDS: Record<string, () => string[][]> = {
  festival_of_lights: solid('A'),
  snowy_pine: solid('K'),
  kinara_glow: solid('W'),
  longest_night: solid('D'),
  midnight_fireworks: solid('D'),
  rosca_de_reyes: solid('W'),
  lanterns_fireworks: solid('K'),
};

export const WINTER_BACKGROUND_VEC: Record<string, VecArt> = {
  festival_of_lights: FESTIVAL_OF_LIGHTS_VEC,
  snowy_pine: SNOWY_PINE_VEC,
  kinara_glow: KINARA_GLOW_VEC,
  longest_night: LONGEST_NIGHT_VEC,
  midnight_fireworks: MIDNIGHT_FIREWORKS_VEC,
  rosca_de_reyes: ROSCA_VEC,
  lanterns_fireworks: LANTERNS_FIREWORKS_VEC,
};

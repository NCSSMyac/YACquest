/** Outfit set items → a Look (hat / accessory / background). Shared by the reveal, the teaser and share cards. */
import { cosmeticById } from '../../lib/cosmetics';
import type { Look } from '../../types';

export function lookOf(items: string[]): Look {
  const look: Look = {};
  for (const id of items) {
    const c = cosmeticById(id);
    if (c) look[c.slot] = id;
  }
  return look;
}

export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

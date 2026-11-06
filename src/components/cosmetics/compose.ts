/**
 * Builds the pixel layers for a character wearing a look: background → character → accessory → hat.
 * Pure data (no React) so tests and the art preview script can use it too.
 */
import { CAMPUSES, type CampusId } from '../../config';
import type { AvatarId, Look } from '../../types';
import { GRIDS, PALETTE } from '../Sprite';
import { ACCESSORY_ART, EXTRA_PALETTE, HAT_ANCHOR, HAT_ART, NECK_ANCHOR, SPARKLES, mageWithoutHat, nudge } from './art';
import { FRAME, backgroundGrid, campusPalette } from './backgrounds';
import { EYE_ANCHOR, SIDE_ANCHOR, STAFF_ACCESSORY_ART, STAFF_HAT_ART } from './staffArt';

export { FRAME };

export interface Layer {
  grid: string[];
  x: number;
  y: number;
  /** Seconds of delay for a twinkling layer (sparkles); undefined = static. */
  twinkle?: number;
}

export const ALL_COLORS: Record<string, string> = { ...PALETTE, ...EXTRA_PALETTE };

export function paletteFor(campus?: CampusId): Record<string, string> {
  const color = CAMPUSES.find((c) => c.id === campus)?.color ?? '#0b2a5b';
  return { ...ALL_COLORS, ...campusPalette(color) };
}

const width = (g: string[]) => Math.max(...g.map((r) => r.length));

export function composeLayers(id: AvatarId, look?: Look): Layer[] {
  const layers: Layer[] = [];
  const char = GRIDS[id] ? id : 'yak';
  const bg = look?.background ? backgroundGrid(look.background) : null;
  if (bg) layers.push({ grid: bg, x: FRAME.x, y: FRAME.y });

  // Staff-only items (0020) are looked up after the participant ones; the server decides who may wear them.
  const hat = look?.hat ? HAT_ART[look.hat] ?? STAFF_HAT_ART[look.hat] : undefined;
  layers.push({ grid: char === 'mage' && hat ? mageWithoutHat() : GRIDS[char], x: 0, y: 0 });

  if (look?.accessory === 'sparkles') {
    for (const s of SPARKLES) layers.push({ grid: s.grid, x: s.x, y: s.y, twinkle: s.delay });
  } else if (look?.accessory && STAFF_ACCESSORY_ART[look.accessory]) {
    const art = STAFF_ACCESSORY_ART[look.accessory];
    const w = width(art.grid);
    const n = nudge(char, look.accessory);
    if (art.anchor === 'eye') {
      const e = EYE_ANCHOR[char];
      layers.push({ grid: art.grid, x: e.x - 2 + (n.x ?? 0), y: e.y - 2 + (n.y ?? 0) });
    } else if (art.anchor === 'side') {
      const e = SIDE_ANCHOR[char];
      layers.push({ grid: art.grid, x: e.x + (n.x ?? 0), y: e.y + (n.y ?? 0) });
    } else {
      const a = NECK_ANCHOR[char];
      layers.push({ grid: art.grid, x: a.x - Math.floor(w / 2) + (n.x ?? 0), y: a.y + (art.sink ?? 0) + (n.y ?? 0) });
    }
  } else if (look?.accessory && ACCESSORY_ART[look.accessory]) {
    const art = ACCESSORY_ART[look.accessory];
    const a = NECK_ANCHOR[char];
    const n = nudge(char, look.accessory);
    layers.push({ grid: art.grid, x: a.x - Math.floor(width(art.grid) / 2) + (n.x ?? 0), y: a.y + (art.sink ?? 0) + (n.y ?? 0) });
  }

  if (hat && look?.hat) {
    const a = HAT_ANCHOR[char];
    const n = nudge(char, look.hat);
    layers.push({ grid: hat.grid, x: a.x - Math.floor(width(hat.grid) / 2) + (n.x ?? 0), y: a.y - hat.grid.length + 1 + (hat.sink ?? 0) + (n.y ?? 0) });
  }
  return layers;
}

/** Flattens layers into a FRAME-sized grid of colors (null = transparent). Used by the preview script/tests. */
export function flatten(layers: Layer[], palette: Record<string, string>): (string | null)[][] {
  const out: (string | null)[][] = Array.from({ length: FRAME.h }, () => Array(FRAME.w).fill(null));
  for (const l of layers)
    l.grid.forEach((row, dy) =>
      [...row].forEach((ch, dx) => {
        const fx = l.x + dx - FRAME.x;
        const fy = l.y + dy - FRAME.y;
        const c = palette[ch];
        if (c && fy >= 0 && fy < FRAME.h && fx >= 0 && fx < FRAME.w) out[fy][fx] = c;
      }),
    );
  return out;
}

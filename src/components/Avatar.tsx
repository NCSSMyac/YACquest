/**
 * A player's character wearing their equipped look: background tile → character → accessory → hat,
 * all in one crisp SVG. Art lives in ./cosmetics/ (hats/accessories/anchors in art.ts, backgrounds in backgrounds.ts).
 */
import type { CampusId } from '../config';
import type { AvatarId, Look } from '../types';
import { cosmeticById } from '../lib/cosmetics';
import { AVATAR_NAMES } from './Sprite';
import { ACCESSORY_ART, HAT_ART, SPARKLES } from './cosmetics/art';
import { backgroundGrid } from './cosmetics/backgrounds';
import { FRAME, composeLayers, paletteFor } from './cosmetics/compose';
import { gridRects, grayPalette, twinkleStyle } from './cosmetics/Pixels';

export function Avatar({
  id,
  look,
  size = 48,
  className,
  title,
  campus,
}: {
  id: AvatarId;
  look?: Look;
  size?: number;
  className?: string;
  title?: string;
  /** Needed only for the "Campus Colors" background. */
  campus?: CampusId;
}) {
  const palette = paletteFor(campus);
  const layers = composeLayers(id, look);
  const label = title ?? describe(id, look);
  return (
    <svg viewBox={`${FRAME.x} ${FRAME.y} ${FRAME.w} ${FRAME.h}`} width={size} height={size} className={className} shapeRendering="crispEdges" role="img" aria-label={label}>
      {layers.map((l, i) =>
        l.twinkle !== undefined ? (
          <g key={i} style={twinkleStyle(l.twinkle)}>{gridRects(l.grid, palette, l.x, l.y, `l${i}`)}</g>
        ) : (
          <g key={i}>{gridRects(l.grid, palette, l.x, l.y, `l${i}`)}</g>
        ),
      )}
    </svg>
  );
}

function describe(id: AvatarId, look?: Look) {
  const parts = [look?.hat, look?.accessory].map((c) => cosmeticById(c)?.name).filter(Boolean);
  const base = AVATAR_NAMES[id] ?? id;
  return parts.length ? `${base} wearing ${parts.join(' and ')}` : base;
}

/** A single wardrobe item on its own (for item tiles). Locked = grayscale. */
export function CosmeticIcon({ id, size = 40, campus, locked = false }: { id: string; size?: number; campus?: CampusId; locked?: boolean }) {
  let palette = paletteFor(campus);
  if (locked) palette = grayPalette(palette);
  const name = cosmeticById(id)?.name ?? id;
  const bg = backgroundGrid(id);
  if (bg)
    return (
      <svg viewBox={`0 0 ${FRAME.w} ${FRAME.h}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label={name}>
        {gridRects(bg, palette)}
      </svg>
    );
  if (id === 'sparkles')
    return (
      <svg viewBox="-2 -4 36 36" width={size} height={size} shapeRendering="crispEdges" role="img" aria-label={name}>
        {SPARKLES.map((s, i) => (
          <g key={i} style={locked ? undefined : twinkleStyle(s.delay)}>{gridRects(s.grid, palette, s.x, s.y + 2, `s${i}`)}</g>
        ))}
        {gridRects(['..g..', '..y..', 'gywyg', '..y..', '..g..'], palette, 13, 10, 'c')}
      </svg>
    );
  const art = HAT_ART[id] ?? ACCESSORY_ART[id];
  if (!art) return null;
  const w = Math.max(...art.grid.map((r) => r.length));
  const h = art.grid.length;
  const side = Math.max(w, h) + 2;
  return (
    <svg viewBox={`${(w - side) / 2} ${(h - side) / 2} ${side} ${side}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label={name}>
      {gridRects(art.grid, palette)}
    </svg>
  );
}

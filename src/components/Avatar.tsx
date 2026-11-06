/**
 * A player's character wearing their equipped look: background tile → character → accessory → hat,
 * all in one crisp SVG. Art lives in ./cosmetics/ (hats/accessories/anchors in art.ts, backgrounds in backgrounds.ts).
 */
import type { CampusId } from '../config';
import type { AvatarId, Look } from '../types';
import { cosmeticById } from '../lib/cosmetics';
import { staffCosmeticById } from '../lib/staffRewards';
import { AVATAR_NAMES } from './Sprite';
import { ACCESSORY_ART, HAT_ART, SPARKLES } from './cosmetics/art';
import { backgroundGrid } from './cosmetics/backgrounds';
import { FRAME, composeLayers, paletteFor } from './cosmetics/compose';
import { gridRects, grayPalette, twinkleStyle } from './cosmetics/Pixels';
import { STAFF_ACCESSORY_ART, STAFF_HAT_ART } from './cosmetics/staffArt';

const itemName = (id?: string) => cosmeticById(id)?.name ?? staffCosmeticById(id)?.name;

export function Avatar({
  id,
  look,
  size = 48,
  className,
  title,
  campus,
  hero,
}: {
  id: AvatarId;
  look?: Look;
  size?: number;
  className?: string;
  title?: string;
  /** Needed only for the "Campus Colors" background. */
  campus?: CampusId;
  /** STAFF ONLY (0020): the reigning Hero of the Week gets a glowing gold ring. */
  hero?: boolean;
}) {
  const palette = paletteFor(campus);
  const layers = composeLayers(id, look);
  const label = title ?? describe(id, look) + (hero ? ', Hero of the Week' : '');
  const svg = (
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
  if (!hero) return svg;
  return (
    <span className="hero-ring" style={{ width: size, height: size }}>
      {svg}
      {heroSparkles(size)}
    </span>
  );
}

// STAFF ONLY (0020): pixel sparkles twinkling around the hero aura. Small avatars get fewer, smaller ones.
// Navy-outlined so they read on light pages as well as on the dark aura background.
const STAR_SMALL = ['..k..', '.kgk.', 'kgwgk', '.kgk.', '..k..'];
const STAR_BIG = ['....k....', '...kgk...', '...kyk...', '.kkgwgkk.', 'kgywwwygk', '.kkgwgkk.', '...kyk...', '...kgk...', '....k....'];
const HERO_SPARKS: { big: boolean; left: string; top: string; delay: number; minSize: number }[] = [
  { big: true, left: '100%', top: '0%', delay: 0, minSize: 0 },
  { big: false, left: '0%', top: '100%', delay: 0.7, minSize: 0 },
  { big: true, left: '0%', top: '8%', delay: 1.1, minSize: 56 },
  { big: false, left: '100%', top: '72%', delay: 0.35, minSize: 56 },
  { big: false, left: '50%', top: '-2%', delay: 1.5, minSize: 120 },
];

function heroSparkles(size: number) {
  const px = size >= 120 ? 3 : size >= 56 ? 2 : 1.5; // screen pixels per sparkle pixel
  return HERO_SPARKS.filter((s) => size >= s.minSize).map((s, i) => {
    const grid = s.big && size >= 56 ? STAR_BIG : STAR_SMALL;
    const n = grid.length * px;
    return (
      <svg
        key={i}
        className="hero-spark"
        aria-hidden="true"
        viewBox={`0 0 ${grid.length} ${grid.length}`}
        width={n}
        height={n}
        shapeRendering="crispEdges"
        style={{ left: s.left, top: s.top, marginLeft: -n / 2, marginTop: -n / 2, animationDelay: `${s.delay}s` }}
      >
        {gridRects(grid, HERO_SPARK_COLORS)}
      </svg>
    );
  });
}
const HERO_SPARK_COLORS: Record<string, string> = { k: '#071a3a', w: '#ffffff', y: '#fff1b0', g: '#f6b93b' };

function describe(id: AvatarId, look?: Look) {
  const parts = [look?.hat, look?.accessory].map(itemName).filter(Boolean);
  const base = AVATAR_NAMES[id] ?? id;
  return parts.length ? `${base} wearing ${parts.join(' and ')}` : base;
}

/** A single wardrobe item on its own (for item tiles). Locked = grayscale. */
export function CosmeticIcon({ id, size = 40, campus, locked = false }: { id: string; size?: number; campus?: CampusId; locked?: boolean }) {
  let palette = paletteFor(campus);
  if (locked) palette = grayPalette(palette);
  const name = itemName(id) ?? id;
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
  const art = HAT_ART[id] ?? ACCESSORY_ART[id] ?? STAFF_HAT_ART[id] ?? STAFF_ACCESSORY_ART[id];
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

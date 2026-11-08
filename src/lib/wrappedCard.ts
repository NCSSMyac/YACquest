/**
 * 0028: the "My YACquest Wrapped" share image — 1080×1920, drawn with the quest card renderer's pieces
 * (src/lib/questCard.ts: background, pixel boxes, tiles, crisp pixel art). Lazy-loaded with the Wrapped screen.
 * wrappedCardModel() is pure (tested); drawWrappedCard() paints it.
 */
import { CYCLE, INSTAGRAM_HANDLE, campusName } from '../config';
import { fmtCycleRange } from './format';
import { badgeById } from './badges';
import { badgeGrid } from '../components/cosmetics/badgeArt';
import { ALL_COLORS, composeLayers, flatten, paletteFor } from '../components/cosmetics/compose';
import type { WrappedData } from '../types';
import { personality, wrappedPun, wrappedTiles } from './wrapped';
import { monthName } from './format';
import {
  BODY_FONT, C, CARD_H, CARD_SITE, CARD_W, PIXEL_FONT, STAR, STAR_PAL,
  background, drawCharGrid, drawColorGrid, hash, loadFonts, pixelBox, rect, text, tile, cardBlob,
} from './questCard';

export { cardBlob };

export interface WrappedCardModel {
  title: string;
  subtitle: string;
  name: string;
  campusLine: string;
  personality: string;
  tiles: { value: string; label: string }[];
  highlights: string[];
  rareBadgeId?: string;
  pun: string;
  dates: string;
  footer: string;
}

export function wrappedCardModel(d: WrappedData): WrappedCardModel {
  const staff = d.role !== 'participant';
  const highlights: string[] = [];
  if (d.bestMonth) highlights.push(`BEST MONTH: ${monthName(d.bestMonth.month).toUpperCase()} (+${d.bestMonth.points})`);
  if (d.rarestBadge) highlights.push(`RAREST BADGE: ${(badgeById(d.rarestBadge.id)?.name ?? d.rarestBadge.id).toUpperCase()} (${d.rarestBadge.pct}%)`);
  if (!staff && d.monthWins > 0) highlights.push(`ADVENTURER OF THE MONTH${d.monthWins > 1 ? ` x${d.monthWins}` : ''}`);
  if (staff && d.staff?.heroCrowns) highlights.push(`HERO OF THE WEEK x${d.staff.heroCrowns}`);
  return {
    title: 'YACquest',
    subtitle: `MY YACQUEST WRAPPED · ${d.cycleName.replace(/ Pilot$/, '')}`.toUpperCase(),
    name: d.displayName,
    campusLine: staff ? `${d.role === 'chair' ? 'YACquest Chair' : 'YAC Council'} · ${campusName(d.campus)}` : `${campusName(d.campus)} adventurer`,
    personality: personality(d).title.toUpperCase(),
    tiles: wrappedTiles(d),
    highlights: highlights.slice(0, 2),
    rareBadgeId: d.rarestBadge?.id,
    pun: wrappedPun(d),
    dates: fmtCycleRange(CYCLE.displayStart, CYCLE.end).replace(/ /g, ' '),
    footer: `${CARD_SITE}  ·  ${INSTAGRAM_HANDLE}`,
  };
}

/** Draws the Wrapped card. Returns the canvas (1080×1920). */
export async function drawWrappedCard(d: WrappedData, canvas: HTMLCanvasElement = document.createElement('canvas')): Promise<HTMLCanvasElement> {
  await loadFonts();
  const m = wrappedCardModel(d);
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available on this device.');
  ctx.imageSmoothingEnabled = false;
  background(ctx, hash(`wrapped:${d.handle || d.displayName}`));
  const cx = CARD_W / 2;

  // Title + gift ribbon line
  text(ctx, m.title, cx, 210, { font: PIXEL_FONT, weight: 700, size: 120, color: C.gold, shadow: C.night, maxW: 900 });
  text(ctx, m.subtitle, cx, 272, { font: PIXEL_FONT, weight: 400, size: 36, color: C.sky, maxW: 920, minSize: 20 });

  // Character (final look) on a stage
  const scale = 12;
  const gridPx = 36 * scale;
  const boxW = gridPx + 48;
  const by = 310;
  pixelBox(ctx, cx - boxW / 2, by, boxW, boxW, C.gold, C.pale, 12);
  const inner = { x: cx - gridPx / 2, y: by + 24 };
  if (!d.look?.background) {
    rect(ctx, inner.x, inner.y + gridPx - 6 * scale, gridPx, 6 * scale, '#7cc56b');
    rect(ctx, inner.x, inner.y + gridPx - 6 * scale, gridPx, scale, '#4f9e57');
  }
  drawColorGrid(ctx, flatten(composeLayers(d.avatar, d.look), paletteFor(d.campus)), inner.x, inner.y, scale);
  for (const [sx, sy] of [[cx - boxW / 2 - 46, by + 40], [cx + boxW / 2 + 8, by + boxW - 90]]) drawCharGrid(ctx, STAR, STAR_PAL, sx, sy, 8);

  // Name, campus, personality
  let y = by + boxW + 96;
  text(ctx, m.name, cx, y, { font: PIXEL_FONT, weight: 700, size: 76, color: C.white, shadow: C.night, maxW: 920, minSize: 34 });
  y += 54;
  text(ctx, m.campusLine, cx, y, { font: BODY_FONT, weight: 700, size: 38, color: C.sky, maxW: 900 });
  y += 30;
  const pw = 860;
  pixelBox(ctx, cx - pw / 2, y, pw, 92, C.gold, '#173a7a', 8);
  text(ctx, m.personality, cx, y + 62, { font: PIXEL_FONT, weight: 700, size: 46, color: C.gold, shadow: C.night, maxW: pw - 60, minSize: 24 });
  y += 92 + 28;

  // Stats: 3 × 2 tiles
  const tw = 296;
  const th = 160;
  const gap = 22;
  const gx = cx - (3 * tw + 2 * gap) / 2;
  m.tiles.forEach((t, i) => tile(ctx, t, gx + (i % 3) * (tw + gap), y + Math.floor(i / 3) * (th + gap), tw, th, i === 0));
  y += 2 * th + gap + 64;

  // Highlights (best month, rarest badge with its icon)
  m.highlights.forEach((h, i) => {
    // body font: the pixel font's "%" reads like a "Z"
    const size = text(ctx, h, cx + (i === 1 && m.rareBadgeId ? 40 : 0), y, { font: BODY_FONT, weight: 800, size: 40, color: i === 0 ? C.white : C.gold, shadow: C.night, maxW: 860, minSize: 22 });
    if (i === 1 && m.rareBadgeId) {
      ctx.font = `800 ${size}px ${BODY_FONT}`;
      const half = ctx.measureText(h).width / 2;
      drawCharGrid(ctx, badgeGrid(m.rareBadgeId), ALL_COLORS, cx + 40 - half - 80, y - 52, 4);
    }
    y += 64;
  });

  // Yak pun, dates, footer
  text(ctx, `“${m.pun}”`, cx, Math.max(y + 24, 1700), { font: BODY_FONT, weight: 600, italic: true, size: 36, color: C.cream, maxW: 940, minSize: 24 });
  text(ctx, m.dates, cx, 1772, { font: BODY_FONT, weight: 700, size: 38, color: C.white, maxW: 940 });
  text(ctx, m.footer, cx, 1838, { font: PIXEL_FONT, weight: 400, size: 28, color: C.sky, maxW: 960, minSize: 16 });
  return canvas;
}

/**
 * 0034 "Share my new look": a 1080×1920 story image after "Wear it now" — the player's character in the
 * new outfit, "I unlocked Latte Night Scholar at Brew & Quest ☕", YACquest branding. Reuses the quest-card
 * renderer (src/lib/questCard.ts). Lazy-loaded; lookCardModel() is pure (tested).
 */
import { INSTAGRAM_HANDLE, campusName, type CampusId } from '../config';
import { ALL_COLORS, composeLayers, drawLayers, paletteFor } from '../components/cosmetics/compose';
import { GRIDS } from '../components/Sprite';
import { BODY_FONT, C, CARD_H, CARD_SITE, CARD_W, PIXEL_FONT, STAR, STAR_PAL, background, drawCharGrid, hash, loadFonts, pixelBox, rect, text } from './questCard';
import type { AvatarId, Look } from '../types';

export interface LookCardInput {
  displayName: string;
  handle: string;
  campus: CampusId;
  avatar: AvatarId;
  look: Look;
  /** "Latte Night Scholar" */
  setName: string;
  /** "Brew & Quest 2026" */
  edition: string;
  /** "Brew & Quest" */
  eventName: string;
  emoji: string;
}

export function lookCardModel(i: LookCardInput) {
  return {
    title: 'YACquest',
    subtitle: 'NEW LOOK UNLOCKED!',
    ribbon: `LIMITED EDITION · ${i.edition}`.toUpperCase(),
    line1: 'I unlocked',
    setName: i.setName,
    line3: `at ${i.eventName} ${i.emoji}`.trim(),
    shareText: `I unlocked ${i.setName} at ${i.eventName} ${i.emoji}`.trim(),
    name: i.displayName,
    campusLine: `${campusName(i.campus)} adventurer`,
    footer: `${CARD_SITE}  ·  ${INSTAGRAM_HANDLE}`,
  };
}

export async function drawLookCard(i: LookCardInput, canvas: HTMLCanvasElement = document.createElement('canvas')): Promise<HTMLCanvasElement> {
  await loadFonts();
  const m = lookCardModel(i);
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available on this device.');
  ctx.imageSmoothingEnabled = false;
  background(ctx, hash(i.handle || i.displayName) + 34);
  const cx = CARD_W / 2;

  text(ctx, m.title, cx, 210, { font: PIXEL_FONT, weight: 700, size: 120, color: C.gold, shadow: C.night, maxW: 900 });
  text(ctx, m.subtitle, cx, 272, { font: PIXEL_FONT, weight: 400, size: 40, color: C.sky, maxW: 900 });

  // Character on a glowing stage, in the full outfit (with its background)
  const scale = 17;
  const gridPx = 36 * scale;
  const boxW = gridPx + 48;
  const bx = cx - boxW / 2;
  const by = 360;
  // soft gold glow rings behind the frame
  for (const [pad, color] of [[44, '#1b3f7d'], [28, '#2a4f93'], [14, '#c98a12']] as const) rect(ctx, bx - pad, by - pad + 16, boxW + 2 * pad, boxW + 2 * pad - 32, color);
  pixelBox(ctx, bx, by, boxW, boxW, C.gold, C.pale, 12);
  const inner = { x: cx - gridPx / 2, y: by + 24 };
  drawLayers(ctx, composeLayers(i.avatar, i.look), paletteFor(i.campus), inner.x, inner.y, scale);
  // ribbon across the top of the frame
  const rw = Math.min(860, 60 + m.ribbon.length * 24);
  rect(ctx, cx - rw / 2 - 8, by - 34, rw + 16, 76, C.night);
  rect(ctx, cx - rw / 2, by - 26, rw, 60, '#8a2fb5');
  rect(ctx, cx - rw / 2, by - 26, rw, 8, '#c2368a');
  text(ctx, m.ribbon, cx, by + 14, { font: PIXEL_FONT, weight: 400, size: 30, color: C.white, maxW: rw - 40, minSize: 18 });
  drawCharGrid(ctx, STAR, STAR_PAL, bx - 70, by + 60, 9);
  drawCharGrid(ctx, STAR, STAR_PAL, bx + boxW + 25, by + 180, 8);
  drawCharGrid(ctx, STAR, STAR_PAL, bx - 50, by + boxW - 120, 7);

  // "I unlocked / LATTE NIGHT SCHOLAR / at Brew & Quest ☕"
  let y = by + boxW + 120;
  text(ctx, m.line1, cx, y, { font: BODY_FONT, weight: 700, size: 52, color: C.white, maxW: 940 });
  y += 104;
  text(ctx, m.setName.toUpperCase(), cx, y, { font: PIXEL_FONT, weight: 700, size: 78, color: C.gold, shadow: C.night, maxW: 960, minSize: 40 });
  y += 86;
  text(ctx, m.line3, cx, y, { font: BODY_FONT, weight: 700, size: 52, color: C.white, maxW: 940 });

  // name + campus
  y += 120;
  text(ctx, m.name, cx, y, { font: PIXEL_FONT, weight: 700, size: 60, color: C.cream, shadow: C.night, maxW: 900, minSize: 30 });
  text(ctx, m.campusLine, cx, y + 54, { font: BODY_FONT, weight: 700, size: 36, color: C.sky, maxW: 900 });

  // little yak + footer
  const yw = Math.max(...GRIDS.yak.map((r) => r.length)) * 5;
  drawCharGrid(ctx, GRIDS.yak, ALL_COLORS, cx - yw / 2, 1630, 5);
  text(ctx, m.footer, cx, 1838, { font: PIXEL_FONT, weight: 400, size: 28, color: C.sky, maxW: 960, minSize: 16 });
  return canvas;
}

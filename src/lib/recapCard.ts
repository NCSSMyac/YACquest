/**
 * 0034 Instagram recap card (staff, Admin → Events → past event → "📸 Recap card"): 1080×1350 (feed) or
 * 1080×1920 (story). Event title, venue, campus colors, "38 adventurers met us at Cup of Joe ☕", free items
 * given (reward events), up to 12 attendee CHARACTERS (never names), a campus thank-you, @ncssmyoungalumni +
 * the yak. Drawn with the quest-card helpers; lazy-loaded.
 */
import { INSTAGRAM_HANDLE } from '../config';
import { ALL_COLORS, composeLayers, drawLayers, paletteFor } from '../components/cosmetics/compose';
import { GRIDS } from '../components/Sprite';
import { BODY_FONT, C, CARD_SITE, PIXEL_FONT, STAR, STAR_PAL, drawCharGrid, loadFonts, pixelBox, rect, text, type Ctx } from './questCard';
import { recapModel } from './promo';
import type { CampusId } from '../config';
import type { EventRecap } from '../types';

import { RECAP_SIZE, type RecapFormat } from './promo';
export { RECAP_SIZE, type RecapFormat };

/** Splits text into lines that fit maxW at the current font. */
export function wrapLines(ctx: Ctx, s: string, maxW: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function seeded(seed: number) {
  let a = seed >>> 0 || 1;
  return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export async function drawRecapCard(r: EventRecap, format: RecapFormat, canvas: HTMLCanvasElement = document.createElement('canvas')): Promise<HTMLCanvasElement> {
  await loadFonts();
  const m = recapModel(r);
  const { w: W, h: H } = RECAP_SIZE[format];
  const story = format === 'story';
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available on this device.');
  ctx.imageSmoothingEnabled = false;
  const cx = W / 2;

  // Night sky + campus-colored stripes at the top and bottom
  rect(ctx, 0, 0, W, H, C.navy);
  for (let i = 0; i < 10; i++) rect(ctx, 0, H - (i + 1) * 40, W, 40, i % 2 ? '#0d2f66' : '#0c2d61');
  const rnd = seeded(r.eventId.split('').reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7));
  for (let i = 0; i < 70; i++) rect(ctx, Math.floor(rnd() * (W / 8)) * 8, Math.floor(rnd() * (H / 8)) * 8, 8, 8, rnd() < 0.5 ? C.navy2 : '#1d4384');
  const band = 28;
  m.colors.forEach((c, i) => {
    const sw = W / m.colors.length;
    rect(ctx, i * sw, 0, sw + 1, band, c);
    rect(ctx, i * sw, H - band, sw + 1, band, c);
  });
  rect(ctx, 0, band, W, 6, C.gold);
  rect(ctx, 0, H - band - 6, W, 6, C.gold);

  let y = story ? 170 : 112;
  text(ctx, 'YACquest  ·  EVENT RECAP', cx, y, { font: PIXEL_FONT, weight: 400, size: 34, color: C.sky, maxW: 940 });
  y += story ? 110 : 92;
  // Title (up to two lines)
  ctx.font = `700 70px ${PIXEL_FONT}, monospace`;
  const titleLines = wrapLines(ctx, m.title, 940).slice(0, 2);
  for (const line of titleLines) {
    text(ctx, line, cx, y, { font: PIXEL_FONT, weight: 700, size: 70, color: C.gold, shadow: C.night, maxW: 960, minSize: 36 });
    y += 80;
  }
  text(ctx, m.dateLine, cx, y, { font: BODY_FONT, weight: 700, size: 36, color: C.pale, maxW: 940 });
  y += story ? 110 : 82;

  // Headline: "38 adventurers met us at Cup of Joe ☕"
  ctx.font = `800 58px ${BODY_FONT}, sans-serif`;
  for (const line of wrapLines(ctx, m.headline, 900).slice(0, 3)) {
    text(ctx, line, cx, y, { font: BODY_FONT, weight: 800, size: 58, color: C.white, shadow: C.night, maxW: 960, minSize: 30 });
    y += 70;
  }
  // "10 free coffees given" pill
  if (m.given) {
    y += 12;
    ctx.font = `800 40px ${BODY_FONT}, sans-serif`;
    const gw = Math.min(900, ctx.measureText(m.given).width + 90);
    pixelBox(ctx, cx - gw / 2, y - 52, gw, 76, C.gold, C.cream, 6);
    text(ctx, `${m.given}`, cx, y - 2, { font: BODY_FONT, weight: 800, size: 40, color: C.navy, maxW: gw - 40, minSize: 24 });
    y += 54;
  }

  // Up to 12 characters (two rows of 6), each in its own little frame. Characters only, never names.
  y += story ? 70 : 40;
  const chars = r.characters.slice(0, 12);
  const scale = 4;
  const cell = 36 * scale; // 144
  const gap = 18;
  const perRow = 6;
  const rows = Math.max(1, Math.ceil(chars.length / perRow));
  for (let row = 0; row < rows; row++) {
    const list = chars.slice(row * perRow, row * perRow + perRow);
    const total = list.length * (cell + 12) + (list.length - 1) * gap;
    let x = cx - total / 2;
    for (const c of list) {
      rect(ctx, x, y, cell + 12, cell + 12, C.night);
      rect(ctx, x + 3, y + 3, cell + 6, cell + 6, C.gold);
      rect(ctx, x + 6, y + 6, cell, cell, C.pale);
      drawLayers(ctx, composeLayers(c.avatar, c.look), paletteFor(r.campus === 'all' ? undefined : (r.campus as CampusId)), x + 6, y + 6, scale);
      x += cell + 12 + gap;
    }
    y += cell + 12 + gap;
  }
  if (!chars.length) {
    drawCharGrid(ctx, GRIDS.yak, ALL_COLORS, cx - 80, y, 5);
    y += 180;
  }

  // Thank-you line with stars
  y += story ? 110 : 66;
  const tw = text(ctx, m.thanks, cx, y, { font: PIXEL_FONT, weight: 700, size: 56, color: C.gold, shadow: C.night, maxW: 860, minSize: 30 });
  ctx.font = `700 ${tw}px ${PIXEL_FONT}`;
  const half = ctx.measureText(m.thanks).width / 2;
  drawCharGrid(ctx, STAR, STAR_PAL, cx - half - 62, y - 44, 9);
  drawCharGrid(ctx, STAR, STAR_PAL, cx + half + 18, y - 44, 9);

  // Footer: yak + @ncssmyoungalumni + site
  const fy = H - band - 6 - (story ? 120 : 92);
  const yakScale = story ? 4 : 3;
  const yakW = Math.max(...GRIDS.yak.map((row) => row.length)) * yakScale;
  ctx.font = `700 40px ${BODY_FONT}, sans-serif`;
  const handleW = ctx.measureText(INSTAGRAM_HANDLE).width;
  const startX = cx - (yakW + 20 + handleW) / 2;
  drawCharGrid(ctx, GRIDS.yak, ALL_COLORS, startX, fy - yakW * 0.75, yakScale);
  text(ctx, INSTAGRAM_HANDLE, startX + yakW + 20, fy, { font: BODY_FONT, weight: 700, size: 40, color: C.white, align: 'left' });
  text(ctx, CARD_SITE, cx, fy + 52, { font: PIXEL_FONT, weight: 400, size: 26, color: C.sky, maxW: 940 });
  return canvas;
}

/**
 * 0022: "My Quest Card" — a 1080×1920 (Instagram story) pixel-art card drawn on a <canvas>, client-side.
 * Lazy-loaded with import() from QuestCard.tsx so it stays out of the main bundle.
 *
 * cardModel() is pure (tested); drawQuestCard() paints it. Pixel art reuses the app's own grids:
 * composeLayers()+flatten() for the character's equipped look and badgeGrid() for badges, drawn with
 * imageSmoothingEnabled = false so every pixel stays crisp.
 */
import { BADGES } from './badges';
import { CYCLE, INSTAGRAM_HANDLE, campusName } from '../config';
import { fmtCycleRange } from './format';
import { yakPun } from './yakPuns';
import { STAFF_BADGES } from './staffRewards';
import { badgeGrid } from '../components/cosmetics/badgeArt';
import { ALL_COLORS, composeLayers, flatten, paletteFor } from '../components/cosmetics/compose';
import type { QuestRecap } from '../types';

export const CARD_W = 1080;
export const CARD_H = 1920;
export const CARD_SITE = 'ncssmyac.github.io/YACquest';

const C = {
  night: '#071a3a',
  navy: '#0b2a5b',
  navy2: '#13306b',
  blue: '#2f6fd6',
  sky: '#86b9ff',
  pale: '#bfe3ff',
  gold: '#f6b93b',
  goldDark: '#c98a12',
  cream: '#fff4dc',
  white: '#ffffff',
};

export interface CardTile {
  value: string;
  label: string;
}

export interface CardModel {
  title: string;
  subtitle: string;
  name: string;
  campusLine: string;
  tiles: CardTile[];
  /** Up to 6 earned badge ids to draw. */
  badgeIds: string[];
  badgeLine: string;
  /** "Adventurer of the Month ×2" (participants who won a finished month). */
  monthWinsLine?: string;
  /** Friendly line for a brand-new player. */
  beginning?: string;
  pun: string;
  dates: string;
  footer: string;
}

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);

/** Everything the card says, from the recap (pure; staff cards never show rank, participants never show Council info). */
export function cardModel(r: QuestRecap, at: Date = new Date()): CardModel {
  const staff = r.role !== 'participant';
  const ended = !!r.cycleEndsAt && at.getTime() > new Date(r.cycleEndsAt).getTime();
  const campus = campusName(r.campus);
  const mos = (n: number) => `${n} ${n === 1 ? 'MO' : 'MOS'}`;
  const tiles: CardTile[] = [
    { value: String(r.points), label: 'POINTS' },
    { value: `${r.badgesEarned}/${r.badgeTotal || BADGES.length}`, label: 'BADGES' },
    { value: String(r.eventsAttended), label: r.eventsAttended === 1 ? 'EVENT' : 'EVENTS' },
    { value: mos(r.bestStreak), label: 'BEST STREAK' },
  ];
  if (staff) {
    tiles.push({ value: `${r.councilBadges ?? 0}/${STAFF_BADGES.length}`, label: 'COUNCIL BADGES' });
    tiles.push({ value: mos(r.currentStreak), label: 'STREAK NOW' });
  } else {
    // (Silkscreen's "#" is a solid blob at this size, so the rank goes in the label instead.)
    tiles.push({ value: String(r.rankCampus ?? '-'), label: `RANK AT ${campus.toUpperCase()}` });
    tiles.push({ value: String(r.rankOverall ?? '-'), label: 'RANK OVERALL' });
  }
  const isNew = r.points <= 0 && r.badgesEarned === 0 && r.eventsAttended === 0;
  return {
    title: 'YACquest',
    subtitle: ended ? `${CYCLE.name.replace(/ Pilot$/, '')} YEAR-END RECAP`.toUpperCase() : 'MY QUEST CARD',
    name: r.displayName,
    campusLine: staff ? `${r.role === 'chair' ? 'YAC Chair' : 'YAC Council'} · ${campus}` : `${campus} adventurer`,
    tiles,
    badgeIds: r.earnedBadgeIds.slice(0, 6),
    badgeLine: r.badgesEarned > 6 ? `+${r.badgesEarned - 6} MORE` : '',
    monthWinsLine: !staff && r.monthWins > 0 ? `ADVENTURER OF THE MONTH${r.monthWins > 1 ? ` x${r.monthWins}` : ''}` : undefined,
    beginning: isNew ? 'Your quest is just beginning!' : undefined,
    pun: yakPun(hash(r.handle || r.displayName)),
    dates: fmtCycleRange(CYCLE.displayStart, CYCLE.end).replace(/ /g, ' '),
    footer: `${CARD_SITE}  ·  ${INSTAGRAM_HANDLE}`,
  };
}

// ───────────────────────────── drawing ─────────────────────────────

const PIXEL_FONT = 'Silkscreen';
const BODY_FONT = 'Nunito';

/** Wait for the bundled fonts so the first draw doesn't fall back to a system font. */
async function loadFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`700 120px ${PIXEL_FONT}`),
      document.fonts.load(`400 40px ${PIXEL_FONT}`),
      document.fonts.load(`700 40px ${BODY_FONT}`),
      document.fonts.load(`600 40px ${BODY_FONT}`),
    ]);
    await document.fonts.ready;
  } catch {
    /* draw with fallbacks */
  }
}

type Ctx = CanvasRenderingContext2D;

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** A chunky pixel box: dark outline, colored border, fill, with notched (stepped) corners. */
function pixelBox(ctx: Ctx, x: number, y: number, w: number, h: number, border: string, fill: string, b = 8) {
  const n = b; // notch size
  rect(ctx, x + n, y, w - 2 * n, h, C.night);
  rect(ctx, x, y + n, w, h - 2 * n, C.night);
  rect(ctx, x + n, y + b / 2, w - 2 * n, h - b, border);
  rect(ctx, x + b / 2, y + n, w - b, h - 2 * n, border);
  rect(ctx, x + b + b / 2, y + b + b / 2, w - 3 * b, h - 3 * b, fill);
}

/** Draws a string[] pixel grid (chars → palette) at `scale` px per pixel. */
function drawCharGrid(ctx: Ctx, grid: string[], palette: Record<string, string>, x: number, y: number, scale: number) {
  grid.forEach((row, gy) =>
    [...row].forEach((ch, gx) => {
      const c = palette[ch];
      if (c) rect(ctx, x + gx * scale, y + gy * scale, scale, scale, c);
    }),
  );
}

function drawColorGrid(ctx: Ctx, grid: (string | null)[][], x: number, y: number, scale: number) {
  grid.forEach((row, gy) =>
    row.forEach((c, gx) => {
      if (c) rect(ctx, x + gx * scale, y + gy * scale, scale, scale, c);
    }),
  );
}

/** Text with a hard pixel drop shadow, shrunk to fit `maxW`. */
function text(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  o: { font: string; size: number; weight?: number; color: string; shadow?: string; maxW?: number; align?: CanvasTextAlign; italic?: boolean; minSize?: number },
) {
  let size = o.size;
  const style = (sz: number) => `${o.italic ? 'italic ' : ''}${o.weight ?? 400} ${sz}px ${o.font}, ${o.font === PIXEL_FONT ? 'monospace' : 'sans-serif'}`;
  ctx.font = style(size);
  if (o.maxW) {
    while (size > (o.minSize ?? 18) && ctx.measureText(s).width > o.maxW) {
      size -= 2;
      ctx.font = style(size);
    }
  }
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'alphabetic';
  if (o.shadow) {
    const d = Math.max(3, Math.round(size / 14));
    ctx.fillStyle = o.shadow;
    ctx.fillText(s, x + d, y + d);
  }
  ctx.fillStyle = o.color;
  ctx.fillText(s, x, y);
  return size;
}

/** Deterministic sparkle field so every card looks the same for the same person. */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

const STAR = ['..k..', '.kgk.', 'kgwgk', '.kgk.', '..k..'];
const STAR_PAL: Record<string, string> = { k: C.night, g: C.gold, w: C.white };

function background(ctx: Ctx, seed: number) {
  rect(ctx, 0, 0, CARD_W, CARD_H, C.navy);
  // soft vertical bands, in big pixel steps
  for (let i = 0; i < 12; i++) rect(ctx, 0, CARD_H - (i + 1) * 40, CARD_W, 40, i % 2 ? '#0d2f66' : '#0c2d61');
  const r = rng(seed);
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(r() * (CARD_W / 8)) * 8;
    const y = Math.floor(r() * (CARD_H / 8)) * 8;
    rect(ctx, x, y, 8, 8, r() < 0.5 ? C.navy2 : '#1d4384');
  }
  // twinkles only where no text goes (beside the title and the character stage)
  const spots = [[80, 96], [960, 90], [150, 300], [900, 300], [110, 470], [940, 430], [170, 700], [880, 640], [100, 860], [960, 860]];
  for (const [sx, sy] of spots) if (r() < 0.75) drawCharGrid(ctx, STAR, STAR_PAL, sx + Math.round((r() - 0.5) * 24), sy + Math.round((r() - 0.5) * 24), 5);
  // outer frame: night line, gold border, inner night line (notched corners)
  const m = 28;
  rect(ctx, m, m + 16, 16, CARD_H - 2 * m - 32, C.gold);
  rect(ctx, CARD_W - m - 16, m + 16, 16, CARD_H - 2 * m - 32, C.gold);
  rect(ctx, m + 16, m, CARD_W - 2 * m - 32, 16, C.gold);
  rect(ctx, m + 16, CARD_H - m - 16, CARD_W - 2 * m - 32, 16, C.gold);
  for (const [cx, cy] of [[m + 16, m + 16], [CARD_W - m - 32, m + 16], [m + 16, CARD_H - m - 32], [CARD_W - m - 32, CARD_H - m - 32]])
    rect(ctx, cx, cy, 16, 16, C.goldDark);
}

function tile(ctx: Ctx, t: CardTile, x: number, y: number, w: number, h: number, highlight: boolean) {
  pixelBox(ctx, x, y, w, h, highlight ? C.gold : C.blue, highlight ? '#173a7a' : C.navy2, 8);
  text(ctx, t.value, x + w / 2, y + 92, { font: PIXEL_FONT, weight: 700, size: 64, color: C.gold, shadow: C.night, maxW: w - 40 });
  text(ctx, t.label, x + w / 2, y + h - 34, { font: BODY_FONT, weight: 700, size: 26, color: C.white, maxW: w - 28, minSize: 16 });
}

/** Draws the card. Returns the canvas (1080×1920). */
export async function drawQuestCard(r: QuestRecap, canvas: HTMLCanvasElement = document.createElement('canvas')): Promise<HTMLCanvasElement> {
  await loadFonts();
  const m = cardModel(r);
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available on this device.');
  ctx.imageSmoothingEnabled = false;
  const seed = hash(r.handle || r.displayName);
  background(ctx, seed);
  const cx = CARD_W / 2;

  // Title
  text(ctx, m.title, cx, 238, { font: PIXEL_FONT, weight: 700, size: 132, color: C.gold, shadow: C.night, maxW: 900 });
  text(ctx, m.subtitle, cx, 300, { font: PIXEL_FONT, weight: 400, size: 40, color: C.sky, maxW: 900 });

  // Character on a pixel stage (their equipped look; no background → pale sky + meadow strip)
  const scale = 14;
  const gridPx = 36 * scale; // FRAME is 36×36
  const boxW = gridPx + 48;
  const bx = cx - boxW / 2;
  const by = 340;
  pixelBox(ctx, bx, by, boxW, boxW, C.gold, C.pale, 12);
  const inner = { x: cx - gridPx / 2, y: by + 24 };
  const layers = composeLayers(r.avatar, r.look);
  if (!r.look?.background) {
    rect(ctx, inner.x, inner.y + gridPx - 6 * scale, gridPx, 6 * scale, '#7cc56b');
    rect(ctx, inner.x, inner.y + gridPx - 6 * scale, gridPx, scale, '#4f9e57');
  }
  drawColorGrid(ctx, flatten(layers, paletteFor(r.campus)), inner.x, inner.y, scale);

  // Name + campus
  const nameY = by + boxW + 104;
  text(ctx, m.name, cx, nameY, { font: PIXEL_FONT, weight: 700, size: 84, color: C.white, shadow: C.night, maxW: 920, minSize: 36 });
  text(ctx, m.campusLine, cx, nameY + 58, { font: BODY_FONT, weight: 700, size: 42, color: C.gold, maxW: 900 });

  // Stats: 3 × 2 tiles
  const tw = 296;
  const th = 168;
  const gap = 22;
  const gx = cx - (3 * tw + 2 * gap) / 2;
  const ty = nameY + 100;
  m.tiles.forEach((t, i) => tile(ctx, t, gx + (i % 3) * (tw + gap), ty + Math.floor(i / 3) * (th + gap), tw, th, i === 0));

  // Badges (up to 6 icons) or the "just beginning" line
  let y = ty + 2 * th + gap + 46;
  if (m.badgeIds.length) {
    const s = 8;
    const size = 16 * s;
    const bgap = 22;
    const total = m.badgeIds.length * size + (m.badgeIds.length - 1) * bgap;
    let x = cx - total / 2;
    for (const id of m.badgeIds) {
      drawCharGrid(ctx, badgeGrid(id), ALL_COLORS, x, y, s);
      x += size + bgap;
    }
    y += size + 52;
    if (m.badgeLine) text(ctx, m.badgeLine, cx, y - 8, { font: PIXEL_FONT, size: 28, color: C.sky });
    else y -= 20;
  } else {
    y += 40;
    text(ctx, m.beginning ?? 'Badges are waiting for you!', cx, y, { font: PIXEL_FONT, weight: 700, size: 46, color: C.gold, shadow: C.night, maxW: 920 });
    y += 30;
  }

  // Adventurer of the Month
  if (m.monthWinsLine) {
    y += 30;
    const w = text(ctx, m.monthWinsLine, cx, y, { font: PIXEL_FONT, weight: 700, size: 36, color: C.gold, shadow: C.night, maxW: 800 });
    ctx.font = `700 ${w}px ${PIXEL_FONT}`;
    const half = ctx.measureText(m.monthWinsLine).width / 2;
    drawCharGrid(ctx, STAR, STAR_PAL, cx - half - 52, y - 34, 8);
    drawCharGrid(ctx, STAR, STAR_PAL, cx + half + 12, y - 34, 8);
    y += 16;
  }

  // Yak pun, dates, footer
  text(ctx, `“${m.pun}”`, cx, Math.max(y + 46, 1690), { font: BODY_FONT, weight: 600, italic: true, size: 36, color: C.cream, maxW: 940, minSize: 24 });
  text(ctx, m.dates, cx, 1772, { font: BODY_FONT, weight: 700, size: 38, color: C.white, maxW: 940 });
  text(ctx, m.footer, cx, 1838, { font: PIXEL_FONT, weight: 400, size: 28, color: C.sky, maxW: 960, minSize: 16 });
  return canvas;
}

/** canvas → PNG Blob. */
export function cardBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t make the image.'))), 'image/png'));
}

/**
 * 0034 "Latte Night Scholar" drawn as vector art (see vector.ts): flat colors, soft shading and the same
 * dark outline as the characters, so each piece reads as what it is at a glance.
 * Units = character pixels. Hat: bottom-center sits on HAT_ANCHOR. Cup: top-left at SIDE_ANCHOR.
 * Background: 36×36 frame (FRAME origin).
 */
import { INK, circle, ellipse, fluffy, poly, rect, star, type VecArt, type VecShape } from './vector';

const CREAM = '#f7ead0';
const CREAM_SH = '#dcc296';
const COCOA = '#8a5530';
const COCOA_DK = '#5a3319';
const COCOA_LT = '#a86d40';

// ───────────── Cozy knit beanie (16 × 13) ─────────────
function beanie(): VecArt {
  const W = 16;
  const cx = W / 2;
  const base = 10.4; // where the dome meets the cuff
  const top = 3.7;
  const rx = 6.5;
  const hw = (y: number) => rx * Math.sqrt(Math.max(0, 1 - ((base - y) / (base - top)) ** 2));
  const domePts = (y0: number, y1: number, side: 'both' | 'right' = 'both', inset = 0): [number, number][] => {
    const L: [number, number][] = [];
    const R: [number, number][] = [];
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const y = y0 + ((y1 - y0) * i) / steps;
      const w = hw(y);
      R.push([cx + w, y]);
      L.push([side === 'right' ? cx + w * inset : cx - w, y]);
    }
    return [...L, ...R.reverse()];
  };
  const dome = domePts(top, base + 0.6);
  // cuff: gently curved band (front of the head is closer → lower edge bows down)
  const cl = 0.7;
  const cr = W - 0.7;
  const cuffTop = (x: number) => 9.7 - 0.9 * (1 - ((x - cx) / (cr - cx)) ** 2);
  const cuffBot = (x: number) => 12.1 + 0.75 * (1 - ((x - cx) / (cr - cx)) ** 2);
  const cuff = `M${cl},10.1Q${cx},7.95 ${cr},10.1L${cr},11.9Q${cx},14.35 ${cl},11.9Z`;
  const ribs: VecShape[] = [];
  for (let x = cl + 1.2; x < cr - 0.6; x += 1.25) {
    ribs.push({ d: poly([[x, cuffTop(x) + 0.35], [x, cuffBot(x) - 0.3]], false), stroke: COCOA_DK, sw: 0.34 });
    ribs.push({ d: poly([[x + 0.42, cuffTop(x + 0.42) + 0.45], [x + 0.42, cuffBot(x + 0.42) - 0.4]], false), stroke: COCOA_LT, sw: 0.26, op: 0.9 });
  }
  return {
    w: W,
    h: 13,
    shapes: [
      // dome: cream knit, two cocoa stripes, shadow on the right, highlight on the left
      { d: poly(dome), fill: CREAM, stroke: INK, sw: 0.75 },
      { d: poly(domePts(5.55, 6.75)), fill: COCOA },
      { d: poly(domePts(7.85, 8.85)), fill: COCOA },
      { d: poly(domePts(top + 0.3, base + 0.4, 'right', 0.45)), fill: '#5a3319', op: 0.16 },
      { d: `M${cx - 4.6},8.9Q${cx - 4.4},5.4 ${cx - 1.6},4.55`, stroke: '#ffffff', sw: 0.55, op: 0.75 },
      // knit "v" stitches on the cream bands
      ...[cx - 3.2, cx - 0.9, cx + 1.4, cx + 3.7].map<VecShape>((x) => ({ d: poly([[x - 0.45, 4.55 + (x > cx + 3 ? 0.5 : 0)], [x, 5.05 + (x > cx + 3 ? 0.5 : 0)], [x + 0.45, 4.55 + (x > cx + 3 ? 0.5 : 0)]], false), stroke: CREAM_SH, sw: 0.28 })),
      ...[cx - 4.4, cx - 2.1, cx + 0.2, cx + 2.5, cx + 4.6].map<VecShape>((x) => ({ d: poly([[x - 0.45, 7.05], [x, 7.55], [x + 0.45, 7.05]], false), stroke: CREAM_SH, sw: 0.28 })),
      { d: poly(dome), stroke: INK, sw: 0.75 },
      // folded ribbed cuff
      { d: cuff, fill: COCOA, stroke: INK, sw: 0.75 },
      ...ribs,
      { d: `M${cl + 0.6},10.25Q${cx},8.55 ${cr - 0.6},10.25`, stroke: COCOA_LT, sw: 0.4 },
      { d: cuff, stroke: INK, sw: 0.75 },
      // fluffy pom-pom
      { d: fluffy(cx, 2.85, 2.25, 10, 0.16), fill: CREAM, stroke: INK, sw: 0.7 },
      { d: `M${cx + 2.05},${2.4}A2.05 2.05 0 0 1 ${cx - 1.0},${4.55}A2.4 2.4 0 0 0 ${cx + 2.05},${2.4}Z`, fill: CREAM_SH },
      { d: circle(cx - 0.75, 2.1, 0.7), fill: '#ffffff', op: 0.9 },
    ],
  };
}

// ───────────── A+ latte: white ceramic cup on a saucer, seen a little from above (14 × 16) ─────────────
function latte(): VecArt {
  const cx = 6.4;
  const rimY = 8.1;
  const rx = 5.0;
  const ry = 2.55;
  const MILK = '#fffaf0';
  const steam = (x: number, s: number): string => `M${x},${5.4 - s * 0.2}C${x - 1.2},${4.4 - s * 0.2} ${x + 1.2},${3.3 - s * 0.2} ${x},${2.2 - s * 0.2}C${x - 0.8},${1.5 - s * 0.2} ${x + 0.3},${1.0} ${x + 0.1},${0.8 + s * 0.3}`;
  const wisps = [steam(cx - 2.2, 1), steam(cx + 0.1, 0), steam(cx + 2.4, 1)];
  const body = `M${cx - rx},${rimY}L${cx - rx + 0.9},${rimY + 4.6}Q${cx},${rimY + 6.6} ${cx + rx - 0.9},${rimY + 4.6}L${cx + rx},${rimY}Z`;
  return {
    w: 14,
    h: 16,
    shapes: [
      // steam: dark halo + white core, so it reads on light pages and on the night background
      ...wisps.map<VecShape>((d, i) => ({ d, stroke: '#7d8aa3', sw: 1.05, op: 0.55, steam: i * 0.7 })),
      ...wisps.map<VecShape>((d, i) => ({ d, stroke: '#ffffff', sw: 0.55, steam: i * 0.7 })),
      // saucer
      { d: ellipse(cx, rimY + 5.75, 6.3, 1.55), fill: '#e6ecf5', stroke: INK, sw: 0.7 },
      { d: ellipse(cx, rimY + 5.45, 4.6, 0.95), fill: '#ffffff' },
      // handle (ring on the right)
      { d: `M${cx + rx - 0.4},${rimY + 1.0}C${cx + rx + 2.6},${rimY + 0.4} ${cx + rx + 2.4},${rimY + 4.4} ${cx + rx - 1.1},${rimY + 4.0}`, stroke: INK, sw: 1.9 },
      { d: `M${cx + rx - 0.4},${rimY + 1.0}C${cx + rx + 2.6},${rimY + 0.4} ${cx + rx + 2.4},${rimY + 4.4} ${cx + rx - 1.1},${rimY + 4.0}`, stroke: '#ffffff', sw: 0.75 },
      // cup body with a soft right-side shadow
      { d: body, fill: '#ffffff', stroke: INK, sw: 0.75 },
      { d: `M${cx + 1.6},${rimY + 0.5}L${cx + rx - 0.15},${rimY + 0.3}L${cx + rx - 0.95},${rimY + 4.6}Q${cx + 2.6},${rimY + 5.9} ${cx + 1.2},${rimY + 6.05}Z`, fill: '#d5deec', op: 0.9 },
      { d: `M${cx - rx + 1.0},${rimY + 1.2}L${cx - rx + 1.6},${rimY + 4.2}`, stroke: '#ffffff', sw: 0.5 },
      { d: body, stroke: INK, sw: 0.75 },
      // rim + latte surface (crema ring, darker coffee, milk-foam "A+")
      { d: ellipse(cx, rimY, rx, ry), fill: '#ffffff', stroke: INK, sw: 0.75 },
      { d: ellipse(cx, rimY + 0.12, rx - 0.6, ry - 0.42), fill: '#d6a46a' },
      { d: ellipse(cx, rimY + 0.2, rx - 1.05, ry - 0.72), fill: '#a8672f' },
      // A
      { d: poly([[cx - 3.0, rimY + 1.1], [cx - 1.85, rimY - 1.15], [cx - 0.7, rimY + 1.1]], false), stroke: MILK, sw: 0.62 },
      { d: poly([[cx - 2.5, rimY + 0.35], [cx - 1.2, rimY + 0.35]], false), stroke: MILK, sw: 0.5 },
      // +
      { d: poly([[cx + 0.55, rimY + 0.05], [cx + 2.75, rimY + 0.05]], false), stroke: MILK, sw: 0.62 },
      { d: poly([[cx + 1.65, rimY - 0.95], [cx + 1.65, rimY + 1.05]], false), stroke: MILK, sw: 0.62 },
      { d: ellipse(cx, rimY, rx, ry), stroke: INK, sw: 0.75 },
    ],
  };
}

// ───────────── Moonlit study nook (36 × 36) ─────────────
function nook(): VecArt {
  const WOOD = '#a0663a';
  const WOOD_LT = '#c98a52';
  const WOOD_DK = '#6e4426';
  const GLOW = '#ffd98a';
  const s: VecShape[] = [];
  // wall + faint wallpaper stripes
  s.push({ d: rect(0, 0, 36, 36), fill: '#18214a' });
  for (let x = 19; x < 36; x += 3.4) s.push({ d: rect(x, 0, 1.1, 29), fill: '#212d60' });
  // warm lamp halo on the wall
  for (const r of [9, 6.5, 4.5]) s.push({ d: circle(29.0, 9.0, r), fill: GLOW, op: 0.04 });

  // window: wood frame, night glass, crescent moon, stars, cross bars, sill
  s.push({ d: rect(1.3, 1.4, 14.8, 15.2, 0.6), fill: WOOD, stroke: INK, sw: 0.7 });
  s.push({ d: rect(2.6, 2.7, 12.2, 12.6), fill: '#0d1a44' });
  s.push({ d: rect(2.6, 9.4, 12.2, 5.9), fill: '#18296a' });
  s.push({ d: rect(2.6, 12.6, 12.2, 2.7), fill: '#22377f' });
  // moon (top-right pane) + glow
  const mx = 12.0;
  const my = 5.7;
  const mr = 2.3;
  s.push({ d: circle(mx - 0.6, my, 3.2), fill: '#fff1b0', op: 0.1 });
  s.push({ d: `M${mx},${my - mr}A${mr} ${mr} 0 0 0 ${mx},${my + mr}A${mr * 1.25} ${mr * 1.25} 0 0 1 ${mx},${my - mr}Z`, fill: '#fff1b0', stroke: '#ffe27a', sw: 0.2 });
  // stars
  s.push({ d: star(5.3, 5.0, 1.15), fill: '#ffffff', twinkle: 0 });
  s.push({ d: star(12.2, 12.3, 1.05), fill: '#fff1b0', twinkle: 0.7 });
  s.push({ d: star(5.8, 12.6, 0.8), fill: '#fff1b0', twinkle: 1.1 });
  for (const [x, y] of [[3.8, 7.6], [7.3, 3.9], [10.6, 10.6], [3.9, 14.1], [13.7, 14.4], [10.4, 3.6]]) s.push({ d: circle(x, y, 0.28), fill: '#ffffff' });
  // cross bars
  s.push({ d: rect(8.25, 2.7, 0.95, 12.6), fill: WOOD });
  s.push({ d: rect(2.6, 8.5, 12.2, 0.95), fill: WOOD });
  s.push({ d: rect(2.6, 2.7, 12.2, 12.6), stroke: WOOD_DK, sw: 0.35 });
  // sill
  s.push({ d: rect(0.5, 16.2, 16.4, 1.5, 0.3), fill: WOOD_LT, stroke: INK, sw: 0.6 });

  // lamp light: soft cone from the shade down onto the desk
  s.push({ d: poly([[26.4, 6.9], [31.6, 11.0], [36, 21.5], [36, 28.6], [12.5, 28.6]]), fill: '#ffcf6b', op: 0.22 });
  s.push({ d: poly([[27.3, 7.9], [30.8, 10.6], [32.5, 28.6], [18.5, 28.6]]), fill: '#ffd98a', op: 0.2 });

  // desk
  s.push({ d: rect(-0.5, 28.6, 37, 8), fill: WOOD, stroke: INK, sw: 0.6 });
  s.push({ d: rect(-0.5, 28.6, 37, 1.7), fill: WOOD_LT });
  s.push({ d: poly([[-0.5, 30.3], [36.5, 30.3]], false), stroke: WOOD_DK, sw: 0.45 });
  for (const [x, y, w] of [[3, 32.4, 6], [14, 33.6, 7], [24, 32.2, 5], [29, 34.6, 6], [6, 35.0, 4]]) s.push({ d: poly([[x, y], [x + w, y]], false), stroke: WOOD_DK, sw: 0.3, op: 0.7 });
  s.push({ d: ellipse(25.5, 29.3, 10, 0.75), fill: GLOW, op: 0.55 });

  // stack of three books (right side of the desk), spines toward us
  const book = (x: number, y: number, w: number, h: number, c: string, dk: string, pagesRight = false) => {
    s.push({ d: rect(x, y, w, h, 0.35), fill: c, stroke: INK, sw: 0.6 });
    s.push({ d: rect(x + 0.3, y + h - 0.55, w - 0.6, 0.35), fill: dk, op: 0.8 });
    s.push({ d: poly([[x + 1.0, y + 0.35], [x + 1.0, y + h - 0.35]], false), stroke: '#f6d77a', sw: 0.3 });
    s.push({ d: poly([[x + 1.6, y + 0.35], [x + 1.6, y + h - 0.35]], false), stroke: '#f6d77a', sw: 0.3 });
    s.push({ d: poly([[x + w - 1.6, y + 0.35], [x + w - 1.6, y + h - 0.35]], false), stroke: '#f6d77a', sw: 0.3 });
    s.push({ d: rect(x + w / 2 - 1.4, y + h / 2 - 0.45, 2.8, 0.9, 0.2), fill: '#fff4dc', op: 0.9 });
    if (pagesRight) {
      s.push({ d: rect(x + w - 0.1, y + 0.35, 0.9, h - 0.7), fill: '#fff4dc', stroke: INK, sw: 0.4 });
    }
  };
  book(25.6, 25.6, 10.0, 3.0, '#2f6fd6', '#0b2a5b');
  book(26.6, 23.4, 8.4, 2.2, '#d0453e', '#7a1f1c', true);
  book(25.9, 21.4, 9.0, 2.0, '#2f9e64', '#145a37');

  // desk lamp: base on the books, brass arm, red cone shade tilted toward the desk
  const BRASS = '#e0a63a';
  const arm = `M31.2,20.6L34.6,13.8L33.3,5.6`;
  s.push({ d: arm, stroke: INK, sw: 1.6 });
  s.push({ d: arm, stroke: BRASS, sw: 0.75 });
  s.push({ d: circle(34.6, 13.8, 0.75), fill: BRASS, stroke: INK, sw: 0.45 });
  s.push({ d: `M28.6,21.5Q31.2,18.8 33.8,21.5Z`, fill: '#c0392b', stroke: INK, sw: 0.55 });
  // shade: back cap at (33,4.6), mouth centred (29.1,8.5) facing down-left
  s.push({ d: poly([[32.0, 3.7], [26.6, 6.5], [31.4, 11.2], [33.9, 5.6]]), fill: '#c0392b', stroke: INK, sw: 0.65 });
  s.push({ d: circle(33.0, 4.6, 1.35), fill: '#c0392b', stroke: INK, sw: 0.6 });
  s.push({ d: poly([[32.2, 4.1], [28.0, 6.2]], false), stroke: '#ec7a64', sw: 0.45 });
  s.push({ d: ellipse(29.0, 8.85, 3.35, 1.05, 45), fill: '#fff6cc', stroke: INK, sw: 0.55 });
  s.push({ d: ellipse(29.0, 8.85, 1.6, 0.55, 45), fill: '#ffffff' });
  return { w: 36, h: 36, shapes: s };
}

export const BEANIE_VEC = beanie();
export const LATTE_VEC = latte();
export const NOOK_VEC = nook();

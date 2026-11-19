/**
 * 0035 WINTER seasonal wardrobe, drawn as vector art (vector.ts) so every piece reads at a glance:
 * Hanukkah, Christmas, Kwanzaa, Winter Solstice, New Year's, Three Kings Day and Lunar New Year.
 * Units = character pixels. Hats: bottom-center on HAT_ANCHOR. Held accessories: top-left at SIDE_ANCHOR.
 * Backgrounds: 36×36 frame (FRAME origin); the main object sits top-left (the corner every character leaves
 * visible) and the full scene shows in the Wardrobe tile and the About modal.
 *
 * Respect rules (docs/SETUP.md → Seasonal wardrobe): backgrounds and everyday objects that are part of the
 * public celebration only — no religious figures, no religious garments or costumes on characters, no
 * caricature, no sacred symbols used as fashion. Have members of each community review changes.
 */
import { INK, circle, ellipse, fluffy, poly, rect, star, type VecArt, type VecShape } from './vector';

type P = [number, number];
const glow = (cx: number, cy: number, r: number, fill: string, op = 0.12): VecShape[] =>
  [1, 0.7, 0.45].map((k) => ({ d: circle(cx, cy, r * k), fill, op }));

/** Teardrop candle flame with a white core, base at (cx, by), height h. */
function flame(cx: number, by: number, h: number, twinkle?: number): VecShape[] {
  const w = h * 0.36;
  const outer = `M${cx},${by - h}C${cx + w * 0.4},${by - h * 0.62} ${cx + w * 1.15},${by - h * 0.32} ${cx},${by}C${cx - w * 1.15},${by - h * 0.32} ${cx - w * 0.4},${by - h * 0.62} ${cx},${by - h}Z`;
  const ih = h * 0.55;
  const iw = w * 0.55;
  const inner = `M${cx},${by - ih}C${cx + iw},${by - ih * 0.45} ${cx + iw},${by - ih * 0.1} ${cx},${by}C${cx - iw},${by - ih * 0.1} ${cx - iw},${by - ih * 0.45} ${cx},${by - ih}Z`;
  return [
    { d: circle(cx, by - h * 0.45, h * 0.9), fill: '#ffd36b', op: 0.18 },
    { d: outer, fill: '#ffb627', stroke: '#e0701a', sw: 0.18, twinkle },
    { d: inner, fill: '#fff6c9' },
  ];
}

/** Firework burst: rays + tip dots. */
function burst(cx: number, cy: number, r: number, color: string, n = 12, twinkle?: number, tip = '#ffffff'): VecShape[] {
  const s: VecShape[] = [{ d: circle(cx, cy, r * 0.9), fill: color, op: 0.1 }];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p0: P = [cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3];
    const p1: P = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    s.push({ d: poly([p0, p1], false), stroke: color, sw: 0.42, twinkle });
    s.push({ d: circle(p1[0], p1[1], 0.32), fill: tip, twinkle });
  }
  s.push({ d: circle(cx, cy, 0.45), fill: tip });
  return s;
}

/** Snow-dusted evergreen (three tiers), trunk base at (cx, by). */
function pine(cx: number, by: number, h: number, w: number, green: string, dark: string, snow = true): VecShape[] {
  const s: VecShape[] = [{ d: rect(cx - w * 0.07, by - h * 0.12, w * 0.14, h * 0.12), fill: '#5e3a22' }];
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const top = by - h + (h * 0.26 * i);
    const bot = by - h * 0.12 - (h * 0.22 * (tiers - 1 - i));
    const hw = (w / 2) * (0.6 + 0.2 * i);
    s.push({ d: poly([[cx, top], [cx + hw, bot], [cx - hw, bot]]), fill: green });
    s.push({ d: poly([[cx, top], [cx + hw, bot], [cx + hw * 0.1, bot]]), fill: dark, op: 0.55 });
    if (snow) s.push({ d: `M${cx - hw * 0.85},${bot}Q${cx - hw * 0.3},${bot - 0.9} ${cx},${bot - 0.35}Q${cx + hw * 0.4},${bot - 0.8} ${cx + hw * 0.9},${bot}Z`, fill: '#f4f8ff' });
  }
  if (snow) s.push({ d: poly([[cx, by - h], [cx + w * 0.11, by - h + h * 0.13], [cx - w * 0.11, by - h + h * 0.13]]), fill: '#f4f8ff' });
  return s;
}

/** A night window (frame + glass + sill) with a callback to paint the view. */
function windowFrame(s: VecShape[], x: number, y: number, w: number, h: number, wood: string, woodDk: string, view: (gx: number, gy: number, gw: number, gh: number) => void, bars = true) {
  s.push({ d: rect(x, y, w, h, 0.6), fill: wood, stroke: INK, sw: 0.7 });
  const gx = x + 1.2;
  const gy = y + 1.2;
  const gw = w - 2.4;
  const gh = h - 2.4;
  view(gx, gy, gw, gh);
  if (bars) {
    s.push({ d: rect(gx + gw / 2 - 0.45, gy, 0.9, gh), fill: wood });
    s.push({ d: rect(gx, gy + gh * 0.48, gw, 0.9), fill: wood });
  }
  s.push({ d: rect(gx, gy, gw, gh), stroke: woodDk, sw: 0.35 });
}

const SNOW_DOTS: P[] = [[3.2, 3.6], [6.1, 5.4], [9.4, 3.1], [12.6, 5.9], [4.4, 8.2], [10.8, 8.6], [14.0, 3.9], [7.6, 9.8], [2.9, 11.3], [13.1, 10.9]];

// ═════════════════════════════ HANUKKAH ═════════════════════════════

/** Background "Festival of Lights": a hanukkiah (8 candles in a row + the raised shamash) glowing on a snowy windowsill. */
function festivalOfLights(): VecArt {
  const s: VecShape[] = [];
  s.push({ d: rect(0, 0, 36, 36), fill: '#16245a' });
  for (let x = 19; x < 36; x += 3.4) s.push({ d: rect(x, 0, 1.1, 28), fill: '#1c2d6a' });
  // falling snow on the wall-side window pane (right)
  windowFrame(s, 22.5, 1.5, 12.5, 12, '#dfe8f7', '#9fb2d4', (gx, gy, gw, gh) => {
    s.push({ d: rect(gx, gy, gw, gh), fill: '#0d1a48' });
    s.push({ d: `M${gx},${gy + gh}L${gx},${gy + gh - 1.6}Q${gx + gw * 0.4},${gy + gh - 2.6} ${gx + gw},${gy + gh - 1.4}L${gx + gw},${gy + gh}Z`, fill: '#eaf2ff' });
    for (const [x, y] of [[1.2, 1.4], [4.0, 3.0], [7.6, 1.6], [2.4, 5.0], [8.6, 5.4], [5.6, 6.6]]) s.push({ d: circle(gx + x, gy + y, 0.32), fill: '#ffffff' });
  });
  // big window (left) with the hanukkiah on its sill
  windowFrame(s, 0.6, 0.8, 18.4, 16.2, '#dfe8f7', '#9fb2d4', (gx, gy, gw, gh) => {
    s.push({ d: rect(gx, gy, gw, gh), fill: '#0b1640' });
    s.push({ d: rect(gx, gy + gh * 0.55, gw, gh * 0.45), fill: '#14245e' });
    for (const [x, y] of SNOW_DOTS) s.push({ d: circle(gx + x * 0.98, gy + y * 0.95, 0.3), fill: '#ffffff', op: 0.9 });
    // snow drift on the outside ledge
    s.push({ d: `M${gx},${gy + gh}L${gx},${gy + gh - 1.5}Q${gx + 4},${gy + gh - 2.6} ${gx + 8},${gy + gh - 1.7}Q${gx + 12},${gy + gh - 2.8} ${gx + gw},${gy + gh - 1.6}L${gx + gw},${gy + gh}Z`, fill: '#eaf2ff' });
  }, false);
  // sill
  s.push({ d: rect(0, 16.4, 19.6, 1.6, 0.3), fill: '#f1f5fc', stroke: INK, sw: 0.6 });

  // hanukkiah: eight candles in a row + the shamash raised in the middle
  const cx = 9.8;
  const cupY = 7.9; // top of the eight cups
  const sp = 1.86;
  const xs = [-4, -3, -2, -1, 1, 2, 3, 4].map((k) => cx + k * sp + (k < 0 ? 0.15 : -0.15));
  for (const r of [8.0, 5.6]) s.push({ d: ellipse(cx, 7.0, r, r * 0.75), fill: '#ffd36b', op: 0.08 });
  const SILVER = '#dfe6f2';
  const SILVER_DK = '#97a6c4';
  // branches: nested U-shapes from the stem to each cup
  for (let k = 1; k <= 4; k++) {
    const dx = xs[4 + k - 1] - cx;
    const d = `M${cx - dx},${cupY + 0.4}Q${cx - dx},${cupY + 0.6 + dx * 0.95} ${cx},${cupY + 0.6 + dx * 0.95}Q${cx + dx},${cupY + 0.6 + dx * 0.95} ${cx + dx},${cupY + 0.4}`;
    s.push({ d, stroke: INK, sw: 0.95 });
    s.push({ d, stroke: SILVER, sw: 0.45 });
  }
  // stem + base
  s.push({ d: rect(cx - 0.5, 7.0, 1.0, 8.8), fill: SILVER, stroke: INK, sw: 0.45 });
  s.push({ d: `M${cx - 3},16.45Q${cx},14.6 ${cx + 3},16.45Z`, fill: SILVER, stroke: INK, sw: 0.5 });
  // cups + candles (white and blue) + flames
  xs.forEach((x, i) => {
    s.push({ d: rect(x - 0.55, cupY, 1.1, 0.75, 0.2), fill: SILVER, stroke: INK, sw: 0.35 });
    s.push({ d: rect(x - 0.32, cupY - 2.3, 0.64, 2.3, 0.15), fill: i % 2 ? '#7fb2f0' : '#ffffff', stroke: INK, sw: 0.25 });
    s.push(...flame(x, cupY - 2.4, 1.45, i * 0.17));
  });
  // shamash: raised in the middle
  s.push({ d: rect(cx - 0.62, 5.2, 1.24, 0.8, 0.2), fill: SILVER, stroke: INK, sw: 0.35 });
  s.push({ d: rect(cx - 0.34, 2.9, 0.68, 2.3, 0.15), fill: '#ffffff', stroke: INK, sw: 0.25 });
  s.push(...flame(cx, 2.8, 1.6, 0.9));
  s.push({ d: poly([[cx - 0.2, 7.6], [cx - 0.2, 15.3]], false), stroke: SILVER_DK, sw: 0.22 });

  // table + a plate of sufganiyot (jelly doughnuts)
  s.push({ d: rect(-0.5, 29, 37, 8), fill: '#3a5aa8', stroke: INK, sw: 0.6 });
  s.push({ d: rect(-0.5, 29, 37, 1.4), fill: '#5b7fd0' });
  for (let x = 1; x < 36; x += 4) s.push({ d: rect(x, 31.6, 2, 0.5), fill: '#ffffff', op: 0.35 });
  s.push({ d: ellipse(29.5, 29.4, 5.6, 1.4), fill: '#ffffff', stroke: INK, sw: 0.5 });
  for (const [x, y] of [[27.4, 27.6], [31.4, 27.7], [29.4, 26.5]] as P[]) {
    s.push({ d: ellipse(x, y, 1.9, 1.4), fill: '#d99045', stroke: INK, sw: 0.4 });
    s.push({ d: ellipse(x, y - 0.55, 1.4, 0.7), fill: '#fff6ea' });
    s.push({ d: circle(x + 0.35, y - 0.25, 0.42), fill: '#c0283d' });
  }
  return { w: 36, h: 36, shapes: s };
}

/** Accessory "Dreidel": a spinning top with נ (nun) on the face we see. */
function dreidel(): VecArt {
  const BLUE = '#2f6fd6';
  const BLUE_DK = '#1b4a9e';
  const s: VecShape[] = [];
  // motion swooshes
  s.push({ d: `M1.0,11.6Q0.4,9.6 1.4,7.6`, stroke: '#9fb7e8', sw: 0.45, op: 0.9 });
  s.push({ d: `M11.2,7.4Q12.1,9.4 11.4,11.4`, stroke: '#9fb7e8', sw: 0.45, op: 0.9 });
  // handle
  s.push({ d: rect(5.45, 0.6, 1.3, 3.0, 0.4), fill: '#e8eef8', stroke: INK, sw: 0.55 });
  // body (slightly turned: front face + right side face)
  const front = poly([[2.4, 3.4], [7.9, 3.4], [7.9, 9.4], [5.2, 13.6], [2.4, 9.4]]);
  const side = poly([[7.9, 3.4], [9.8, 2.7], [9.8, 8.7], [5.2, 13.6], [7.9, 9.4]]);
  const top = poly([[2.4, 3.4], [4.4, 2.7], [9.8, 2.7], [7.9, 3.4]]);
  s.push({ d: side, fill: BLUE_DK, stroke: INK, sw: 0.6 });
  s.push({ d: front, fill: BLUE, stroke: INK, sw: 0.6 });
  s.push({ d: top, fill: '#8db6f2', stroke: INK, sw: 0.55 });
  s.push({ d: rect(5.45, 0.6, 1.3, 2.6, 0.4), fill: '#e8eef8', stroke: INK, sw: 0.55 });
  s.push({ d: poly([[3.0, 4.2], [3.0, 8.6]], false), stroke: '#ffffff', sw: 0.45, op: 0.7 });
  // נ nun: short top stroke, vertical on the right, base to the left
  const nun = `M4.55,4.75L5.6,4.75Q5.95,4.75 5.95,5.15L5.95,8.25L4.35,8.25`;
  s.push({ d: nun, stroke: '#ffffff', sw: 0.66 });
  s.push({ d: circle(4.6, 4.8, 0.42), fill: '#ffffff' }); // the small head of the letter
  // little silver tip + floor shadow
  s.push({ d: ellipse(5.2, 14.3, 2.6, 0.45), fill: '#1b2340', op: 0.25 });
  return { w: 12, h: 15, shapes: s };
}

// ═════════════════════════════ CHRISTMAS ═════════════════════════════

/** Background "Snowy Pine & Lights": a decorated evergreen with string lights and wrapped gifts by a snowy window. */
function snowyPine(): VecArt {
  const s: VecShape[] = [];
  s.push({ d: rect(0, 0, 36, 36), fill: '#2a1d3f' });
  for (let x = 1; x < 36; x += 3.6) s.push({ d: rect(x, 0, 1.2, 29), fill: '#33254d' });
  for (const r of [10, 7]) s.push({ d: circle(27.5, 15, r), fill: '#ffd98a', op: 0.05 });
  windowFrame(s, 0.6, 0.8, 15.6, 15.4, '#8a5530', '#5a3319', (gx, gy, gw, gh) => {
    s.push({ d: rect(gx, gy, gw, gh), fill: '#0f1d4d' });
    s.push(...pine(gx + 3.4, gy + gh, 7.5, 5.2, '#1f5a3a', '#0f3a24'));
    s.push(...pine(gx + 10.4, gy + gh, 9, 6, '#1f5a3a', '#0f3a24'));
    s.push({ d: `M${gx},${gy + gh}L${gx},${gy + gh - 1.4}Q${gx + 6},${gy + gh - 2.6} ${gx + gw},${gy + gh - 1.2}L${gx + gw},${gy + gh}Z`, fill: '#eef4ff' });
    for (const [x, y] of SNOW_DOTS) s.push({ d: circle(gx + x * 0.85, gy + y * 0.9, 0.3), fill: '#ffffff' });
  });
  s.push({ d: rect(0, 15.6, 17.2, 1.5, 0.3), fill: '#c98a52', stroke: INK, sw: 0.6 });
  s.push({ d: `M0.6,16.4Q4,15.0 8,15.9Q12,15.0 16.6,16.2L16.6,16.8L0.6,16.8Z`, fill: '#f4f8ff' });

  // floor
  s.push({ d: rect(-0.5, 29.5, 37, 7), fill: '#7a4a2a', stroke: INK, sw: 0.6 });
  s.push({ d: rect(-0.5, 29.5, 37, 1.2), fill: '#9a6438' });

  // the tree (right)
  const cx = 27.6;
  const G = '#2f8f4e';
  const GD = '#1d6a39';
  const tiers: [number, number, number][] = [[3.2, 11.2, 4.6], [7.6, 18.0, 6.6], [12.6, 25.8, 8.6]];
  for (const [t, b, hw] of tiers) {
    const d = `M${cx},${t}L${cx + hw},${b}Q${cx},${b + 1.4} ${cx - hw},${b}Z`;
    s.push({ d, fill: G, stroke: INK, sw: 0.65 });
    s.push({ d: `M${cx},${t}L${cx + hw},${b}Q${cx + hw * 0.5},${b + 0.9} ${cx + 0.4},${b + 0.7}Z`, fill: GD, op: 0.7 });
  }
  s.push({ d: rect(cx - 1.1, 25.8, 2.2, 3.2), fill: '#6e4426', stroke: INK, sw: 0.5 });
  // garland of lights (draped curves) + bulbs
  const LIGHTS = ['#ff5a5a', '#ffd23f', '#5ad1ff', '#7dff7a', '#ff8ad8'];
  const drapes: [number, number, number, number][] = [[cx - 3.0, 9.0, cx + 3.4, 10.4], [cx - 5.2, 15.4, cx + 5.6, 16.8], [cx - 7.2, 22.6, cx + 7.4, 24.0]];
  let li = 0;
  for (const [x0, y0, x1, y1] of drapes) {
    const my = Math.max(y0, y1) + 1.2;
    s.push({ d: `M${x0},${y0}Q${(x0 + x1) / 2},${my + 0.8} ${x1},${y1}`, stroke: '#1b2340', sw: 0.25 });
    const n = Math.round((x1 - x0) / 2.1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * ((x0 + x1) / 2) + t ** 2 * x1;
      const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * (my + 0.8) + t ** 2 * y1;
      const c = LIGHTS[li++ % LIGHTS.length];
      s.push({ d: circle(x, y + 0.3, 0.95), fill: c, op: 0.25 });
      s.push({ d: ellipse(x, y + 0.35, 0.42, 0.55), fill: c, stroke: INK, sw: 0.18, twinkle: (li % 3) * 0.45 });
    }
  }
  // star topper (simple, golden)
  s.push(...glow(cx, 2.8, 2.6, '#ffe27a', 0.14));
  s.push({ d: poly(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 0.75 : 1.75; return [cx + Math.cos(a) * r, 2.9 + Math.sin(a) * r] as P; })), fill: '#ffd23f', stroke: INK, sw: 0.4 });

  // gifts
  const gift = (x: number, y: number, w: number, h: number, box: string, ribbon: string) => {
    s.push({ d: rect(x, y, w, h, 0.3), fill: box, stroke: INK, sw: 0.55 });
    s.push({ d: rect(x + w / 2 - 0.4, y, 0.8, h), fill: ribbon });
    s.push({ d: rect(x, y + h * 0.35, w, 0.7), fill: ribbon });
    s.push({ d: `M${x + w / 2},${y}C${x + w / 2 - 1.8},${y - 1.6} ${x + w / 2 - 2.0},${y + 0.3} ${x + w / 2},${y}C${x + w / 2 + 2.0},${y + 0.3} ${x + w / 2 + 1.8},${y - 1.6} ${x + w / 2},${y}Z`, fill: ribbon, stroke: INK, sw: 0.35 });
  };
  gift(20.4, 26.6, 4.6, 3.6, '#d0453e', '#ffd23f');
  gift(30.2, 25.8, 5.2, 4.4, '#2f6fd6', '#ffffff');
  gift(25.4, 27.6, 3.8, 2.6, '#ffd23f', '#d0453e');
  gift(0.8, 26.6, 4.8, 3.6, '#2f9e64', '#ff8ad8');
  return { w: 36, h: 36, shapes: s };
}

/** Hat "Cozy Holiday Hat": red knit hat, fluffy white trim, a flop to the side and a pom-pom. */
function holidayHat(): VecArt {
  const RED = '#d2363a';
  const RED_DK = '#9e1f28';
  const s: VecShape[] = [];
  // body: from the trim up to a tip flopping to the right
  const body = `M1.6,11.2C1.6,6.2 4.6,2.6 9.4,2.2C13.2,1.9 15.9,3.3 17.2,6.4C16.0,5.4 14.6,5.2 13.6,5.8C15.3,7.4 16.0,9.2 16.3,11.2Z`;
  s.push({ d: body, fill: RED, stroke: INK, sw: 0.75 });
  s.push({ d: `M10.4,2.3C13.4,2.4 15.8,3.8 17.2,6.4C16.0,5.4 14.6,5.2 13.6,5.8C15.3,7.4 16.0,9.2 16.3,11.2L12.6,11.2C12.6,7.9 12.2,4.6 10.4,2.3Z`, fill: RED_DK, op: 0.45 });
  s.push({ d: `M4.0,9.6C4.2,6.6 6.0,4.4 8.8,3.6`, stroke: '#ff8a8a', sw: 0.55, op: 0.85 });
  // knit texture (little v's)
  for (const [x, y] of [[5.4, 7.6], [8.0, 6.4], [10.6, 7.0], [7.2, 9.2], [10.0, 9.6], [13.0, 9.4], [12.4, 4.6]] as P[])
    s.push({ d: poly([[x - 0.45, y], [x, y + 0.5], [x + 0.45, y]], false), stroke: RED_DK, sw: 0.28 });
  // fluffy trim
  const trim = `M0.6,10.6Q9,8.6 17.4,10.6L17.4,13.4Q9,15.2 0.6,13.4Z`;
  s.push({ d: trim, fill: '#ffffff', stroke: INK, sw: 0.75 });
  for (const x of [2.2, 4.4, 6.6, 8.8, 11.0, 13.2, 15.4]) s.push({ d: circle(x, 12.2 + (Math.abs(x - 9) < 5 ? 0.3 : 0), 0.75), fill: '#e7edf7' });
  s.push({ d: trim, stroke: INK, sw: 0.75 });
  // pom-pom on the flopped tip
  s.push({ d: fluffy(17.0, 7.4, 1.9, 9, 0.16), fill: '#ffffff', stroke: INK, sw: 0.65 });
  s.push({ d: circle(16.4, 6.8, 0.6), fill: '#ffffff' });
  s.push({ d: `M18.4,7.6A1.5 1.5 0 0 1 16.2,9.0A1.8 1.8 0 0 0 18.4,7.6Z`, fill: '#dfe6f2' });
  return { w: 19, h: 15, shapes: s };
}

/** Accessory "Candy Cane": red-and-white striped hook with a small bow. */
function candyCane(): VecArt {
  const s: VecShape[] = [];
  const path = `M3.0,15.4L3.0,5.0C3.0,2.0 8.6,2.0 8.6,5.0L8.6,6.4`;
  s.push({ d: path, stroke: INK, sw: 2.7 });
  s.push({ d: path, stroke: '#ffffff', sw: 1.75 });
  // stripes: alternate red pieces along the centerline (straight shaft, then the hook)
  const pts: P[] = [];
  for (let y = 15.0; y > 5.0; y -= 0.25) pts.push([3.0, y]);
  for (let a = Math.PI; a >= 0; a -= 0.05) pts.push([5.8 + Math.cos(a) * 2.8, 5.0 - Math.sin(a) * 2.8]);
  for (let y = 5.0; y <= 6.3; y += 0.25) pts.push([8.6, y]);
  let run: P[] = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const red = Math.floor(acc / 0.95) % 2 === 1;
    if (red) run.push(pts[i]);
    else if (run.length > 1) {
      s.push({ d: poly(run, false), stroke: '#d2363a', sw: 1.6 });
      run = [];
    } else run = [];
  }
  if (run.length > 1) s.push({ d: poly(run, false), stroke: '#d2363a', sw: 1.6 });
  s.push({ d: `M2.6,6.0L2.6,14.6`, stroke: '#ffffff', sw: 0.3, op: 0.8 });
  // green bow
  s.push({ d: `M3.0,9.6C1.0,8.0 0.4,10.6 3.0,9.6C5.6,10.6 5.0,8.0 3.0,9.6Z`, fill: '#2f9e64', stroke: INK, sw: 0.4 });
  s.push({ d: poly([[3.0, 9.6], [2.0, 11.6]], false), stroke: '#2f9e64', sw: 0.55 });
  s.push({ d: poly([[3.0, 9.6], [4.0, 11.6]], false), stroke: '#2f9e64', sw: 0.55 });
  s.push({ d: circle(3.0, 9.6, 0.45), fill: '#1f7a4a', stroke: INK, sw: 0.25 });
  return { w: 11, h: 16, shapes: s };
}

// ═════════════════════════════ KWANZAA ═════════════════════════════

/** Background "Kinara Glow": a kinara with 3 red, 1 black, 3 green candles on a woven mkeka, with corn and the unity cup. */
function kinaraGlow(): VecArt {
  const s: VecShape[] = [];
  s.push({ d: rect(0, 0, 36, 36), fill: '#3b2018' });
  for (let x = 2; x < 36; x += 4) s.push({ d: rect(x, 0, 1.6, 30), fill: '#43251c' });
  for (const r of [14, 10, 7]) s.push({ d: ellipse(9.5, 8.5, r, r * 0.8), fill: '#ffb84d', op: 0.06 });

  // mkeka: a woven mat on the low table (stripes red / black / green / gold, woven ticks)
  const matTop = 13.6;
  const matH = 3.0;
  s.push({ d: rect(0, matTop + matH, 36, 1.4), fill: '#7a4a2a', stroke: INK, sw: 0.5 });
  const STRIPES = ['#c8372d', '#1b1b1b', '#2f8f4e', '#e0a63a'];
  s.push({ d: rect(0, matTop, 36, matH), fill: '#c9a46a', stroke: INK, sw: 0.55 });
  for (let i = 0, x = 0.4; x < 36; i++, x += 1.5) s.push({ d: rect(x, matTop + 0.4, 0.9, matH - 0.8), fill: STRIPES[i % 4] });
  for (let x = 0.4; x < 36; x += 1.0) s.push({ d: poly([[x, matTop + matH / 2], [x + 0.5, matTop + matH / 2]], false), stroke: '#f3e2bd', sw: 0.25, op: 0.7 });

  // kinara (wood): a gently arched bar with seven holders
  const cx = 8.8;
  const sp = 2.05;
  const xs = [-3, -2, -1, 0, 1, 2, 3].map((k) => cx + k * sp);
  const WOOD = '#8a5530';
  s.push({ d: `M${cx - 7.6},11.2Q${cx},9.6 ${cx + 7.6},11.2L${cx + 7.6},12.4Q${cx},10.8 ${cx - 7.6},12.4Z`, fill: WOOD, stroke: INK, sw: 0.55 });
  s.push({ d: rect(cx - 2.4, 12.0, 4.8, 1.7, 0.5), fill: '#6e4426', stroke: INK, sw: 0.5 });
  const COLORS = ['#c8372d', '#c8372d', '#c8372d', '#1b1b1b', '#2f8f4e', '#2f8f4e', '#2f8f4e'];
  xs.forEach((x, i) => {
    const arch = 10.4 - 0.75 * (1 - ((x - cx) / 7.6) ** 2);
    s.push({ d: rect(x - 0.6, arch - 0.6, 1.2, 0.9, 0.2), fill: '#a86d40', stroke: INK, sw: 0.35 });
    const ch = 3.2;
    s.push({ d: rect(x - 0.38, arch - 0.6 - ch, 0.76, ch, 0.15), fill: COLORS[i], stroke: i === 3 ? '#5b5b5b' : INK, sw: 0.25 });
    s.push({ d: poly([[x - 0.15, arch - 0.6 - ch + 0.3], [x - 0.15, arch - 0.9]], false), stroke: '#ffffff', sw: 0.18, op: i === 3 ? 0.35 : 0.3 });
    s.push(...flame(x, arch - 0.7 - ch, 1.5, i * 0.2));
  });

  // unity cup (kikombe cha umoja) on the mat, right
  const ux = 31.2;
  s.push({ d: `M${ux - 2.0},6.2L${ux + 2.0},6.2Q${ux + 1.9},9.4 ${ux},9.8Q${ux - 1.9},9.4 ${ux - 2.0},6.2Z`, fill: '#e0a63a', stroke: INK, sw: 0.5 });
  s.push({ d: rect(ux - 0.35, 9.7, 0.7, 2.6), fill: '#c98a2a', stroke: INK, sw: 0.35 });
  s.push({ d: ellipse(ux, 13.2, 1.9, 0.6), fill: '#e0a63a', stroke: INK, sw: 0.45 });
  s.push({ d: ellipse(ux, 6.2, 2.0, 0.5), fill: '#f6c96a', stroke: INK, sw: 0.4 });
  s.push({ d: poly([[ux - 1.2, 6.9], [ux - 1.0, 8.6]], false), stroke: '#fff1c9', sw: 0.3 });

  // ears of corn (muhindi), lying on the mat at the right
  const corn = (x: number, y: number, rot: number) => {
    s.push({ d: ellipse(x, y, 2.6, 0.95, rot), fill: '#f2c53d', stroke: INK, sw: 0.4 });
    const r = (rot * Math.PI) / 180;
    for (let k = -1.8; k <= 1.8; k += 0.9) s.push({ d: circle(x + Math.cos(r) * k, y + Math.sin(r) * k, 0.28), fill: '#e0a020' });
    s.push({ d: `M${x - Math.cos(r) * 2.4},${y - Math.sin(r) * 2.4}q-1.6,-0.9 -2.6,0.4q1.4,0.2 2.6,0.4Z`, fill: '#9cb04a', stroke: INK, sw: 0.3 });
  };
  corn(24.2, 12.8, -12);
  corn(25.6, 13.4, 8);

  // floor mat (bottom)
  s.push({ d: rect(-0.5, 30, 37, 7), fill: '#5a3319', stroke: INK, sw: 0.5 });
  for (let i = 0, x = 0; x < 36; i++, x += 2.25) s.push({ d: rect(x, 30.8, 1.4, 5.4), fill: STRIPES[i % 4], op: 0.8 });
  return { w: 36, h: 36, shapes: s };
}

// 0036 Kwanzaa accessories: everyday celebration objects, in the Kwanzaa colors where they belong.
const K_RED = '#c8372d';
const K_BLACK = '#1b1b1b';
const K_GREEN = '#2f8f4e';

/** Accessory "Kikombe cha Umoja (Unity Cup)": a simple carved wooden goblet (held at the side). */
function unityCup(): VecArt {
  const s: VecShape[] = [];
  const WOOD = '#a8672f';
  const WOOD_LT = '#c98a4e';
  const WOOD_DK = '#7a4520';
  const cx = 5.6;
  // soft glow so it reads as special
  s.push({ d: circle(cx, 5.2, 5.2), fill: '#ffd36b', op: 0.12 });
  // bowl: wide rim, rounded body
  const bowl = `M${cx - 4.4},2.4L${cx + 4.4},2.4C${cx + 4.4},6.6 ${cx + 2.6},8.4 ${cx},8.6C${cx - 2.6},8.4 ${cx - 4.4},6.6 ${cx - 4.4},2.4Z`;
  s.push({ d: bowl, fill: WOOD, stroke: INK, sw: 0.6 });
  // right-side shade
  s.push({ d: `M${cx + 1.6},2.6L${cx + 4.2},2.6C${cx + 4.1},6.2 ${cx + 2.6},8.0 ${cx + 0.6},8.4C${cx + 2.2},7.0 ${cx + 2.4},4.8 ${cx + 1.6},2.6Z`, fill: WOOD_DK, op: 0.55 });
  // carved band: a zig-zag between two grooves
  s.push({ d: `M${cx - 4.15},4.0Q${cx},4.5 ${cx + 4.15},4.0`, stroke: WOOD_DK, sw: 0.3 });
  s.push({ d: `M${cx - 3.8},5.6Q${cx},6.1 ${cx + 3.8},5.6`, stroke: WOOD_DK, sw: 0.3 });
  const zz: P[] = [];
  for (let i = 0; i <= 8; i++) zz.push([cx - 3.6 + i * 0.9, (i % 2 ? 5.4 : 4.3) + 0.2 * (1 - ((i - 4) / 4) ** 2)]);
  s.push({ d: poly(zz, false), stroke: '#f0c27a', sw: 0.32 });
  // rim (the opening) + highlight
  s.push({ d: ellipse(cx, 2.4, 4.4, 0.95), fill: WOOD_LT, stroke: INK, sw: 0.5 });
  s.push({ d: ellipse(cx, 2.5, 3.5, 0.55), fill: '#5a3018' });
  s.push({ d: `M${cx - 3.2},3.4C${cx - 3.2},5.4 ${cx - 2.4},6.8 ${cx - 1.4},7.6`, stroke: '#f3d2a2', sw: 0.35, op: 0.8 });
  // stem with a carved knot
  s.push({ d: rect(cx - 0.75, 8.4, 1.5, 3.6, 0.3), fill: WOOD, stroke: INK, sw: 0.45 });
  s.push({ d: ellipse(cx, 9.9, 1.35, 0.7), fill: WOOD_LT, stroke: INK, sw: 0.4 });
  // foot
  s.push({ d: `M${cx - 3.0},13.6Q${cx - 2.6},11.9 ${cx - 0.75},11.7L${cx + 0.75},11.7Q${cx + 2.6},11.9 ${cx + 3.0},13.6Z`, fill: WOOD, stroke: INK, sw: 0.5 });
  s.push({ d: ellipse(cx, 13.6, 3.0, 0.6), fill: WOOD_DK, stroke: INK, sw: 0.45 });
  s.push({ d: `M${cx - 1.8},13.0Q${cx - 1.4},12.3 ${cx - 0.5},12.2`, stroke: '#f3d2a2', sw: 0.3, op: 0.7 });
  return { w: 12, h: 15, shapes: s };
}

/** Accessory "Zawadi (Gift)": a book wrapped with a red, black and green ribbon and a bow (held at the side). */
function zawadi(): VecArt {
  const s: VecShape[] = [];
  const COVER = '#9a6a3a';
  const COVER_LT = '#c08a50';
  const PAGES = '#fbf5e6';
  // a hardcover book lying flat, seen a little from above: top cover + front (page block) + right side
  const y0 = 8.4; // front top edge
  const y1 = 13.6; // front bottom edge
  const d = 2.6; // depth offset (up-right)
  const top: P[] = [[0.6, y0], [0.6 + d, y0 - d], [11.4, y0 - d], [11.4 - d, y0]];
  s.push({ d: ellipse(6.0, y1 + 0.5, 5.6, 0.5), fill: '#1b2340', op: 0.2 });
  s.push({ d: poly([[0.6, y0], [11.4 - d, y0], [11.4 - d, y1], [0.6, y1]]), fill: COVER, stroke: INK, sw: 0.55 });
  s.push({ d: poly([[11.4 - d, y0], [11.4, y0 - d], [11.4, y1 - d], [11.4 - d, y1]]), fill: COVER, stroke: INK, sw: 0.55 });
  s.push({ d: rect(1.2, y0 + 0.75, 11.4 - d - 1.8, y1 - y0 - 1.5), fill: PAGES, stroke: INK, sw: 0.3 });
  for (const y of [y0 + 1.6, y0 + 2.4, y0 + 3.2]) s.push({ d: poly([[1.4, y], [11.4 - d - 0.8, y]], false), stroke: '#d9cdb2', sw: 0.18 });
  s.push({ d: poly([[11.4 - d + 0.3, y0 + 0.5], [11.1, y0 - d + 0.8], [11.1, y1 - d - 0.6], [11.4 - d + 0.3, y1 - 0.9]]), fill: PAGES, stroke: INK, sw: 0.3 });
  s.push({ d: poly(top), fill: COVER_LT, stroke: INK, sw: 0.55 });
  s.push({ d: poly([[1.9, y0 - 0.5], [2.7, y0 - 1.3], [4.0, y0 - 1.3], [3.2, y0 - 0.5]]), fill: '#f2c14e', op: 0.9 });
  // ribbon: three bands (red / black / green) over the top, front-to-back, and down the front
  const COLS = [K_RED, K_BLACK, K_GREEN];
  const rx0 = 4.6;
  const bw = 0.62;
  COLS.forEach((c, k) => {
    const x = rx0 + k * bw;
    s.push({ d: poly([[x, y0], [x + bw, y0], [x + bw + d, y0 - d], [x + d, y0 - d]]), fill: c });
    s.push({ d: rect(x, y0, bw, y1 - y0), fill: c });
  });
  s.push({ d: poly([[rx0, y0], [rx0 + 3 * bw, y0], [rx0 + 3 * bw + d, y0 - d], [rx0 + d, y0 - d]]), stroke: INK, sw: 0.25 });
  s.push({ d: rect(rx0, y0, 3 * bw, y1 - y0), stroke: INK, sw: 0.25 });
  s.push({ d: poly(top), stroke: INK, sw: 0.55 });
  // bow on the top cover
  const bx = rx0 + 1.5 * bw + d / 2;
  const by = y0 - d / 2;
  s.push({ d: `M${bx},${by}C${bx - 2.6},${by - 3.4} ${bx - 4.0},${by - 0.6} ${bx - 2.0},${by + 0.3}C${bx - 1.2},${by + 0.6} ${bx - 0.5},${by + 0.3} ${bx},${by}Z`, fill: K_RED, stroke: INK, sw: 0.4 });
  s.push({ d: `M${bx},${by}C${bx + 2.6},${by - 3.4} ${bx + 4.0},${by - 0.6} ${bx + 2.0},${by + 0.3}C${bx + 1.2},${by + 0.6} ${bx + 0.5},${by + 0.3} ${bx},${by}Z`, fill: K_GREEN, stroke: INK, sw: 0.4 });
  s.push({ d: `M${bx - 2.0},${by - 1.4}C${bx - 2.1},${by - 1.9} ${bx - 1.7},${by - 2.2} ${bx - 1.3},${by - 2.0}`, stroke: '#ff9a8a', sw: 0.25, op: 0.9 });
  s.push({ d: `M${bx + 1.3},${by - 2.0}C${bx + 1.7},${by - 2.2} ${bx + 2.1},${by - 1.9} ${bx + 2.0},${by - 1.4}`, stroke: '#8fe0aa', sw: 0.25, op: 0.9 });
  s.push({ d: ellipse(bx, by, 0.8, 0.65), fill: K_BLACK, stroke: INK, sw: 0.3 });
  return { w: 12, h: 15, shapes: s };
}

/** Accessory "Red, Black & Green Scarf": a cozy knit scarf in the Kwanzaa colors, worn at the neck. */
function kwanzaaScarf(): VecArt {
  const s: VecShape[] = [];
  const W = 14;
  // the wrap around the neck: a curved band
  const wrapTop = `M0.8,1.0Q${W / 2},4.4 ${W - 0.8},1.0`;
  const wrap = `${wrapTop}L${W - 0.6},3.4Q${W / 2},7.4 0.6,3.4Z`;
  s.push({ d: wrap, fill: K_GREEN, stroke: INK, sw: 0.6 });
  // knit stripes along the wrap: red top edge band, black middle line
  s.push({ d: `M1.0,1.9Q${W / 2},5.3 ${W - 1.0},1.9`, stroke: K_RED, sw: 0.75 });
  s.push({ d: `M0.9,2.9Q${W / 2},6.3 ${W - 0.9},2.9`, stroke: K_BLACK, sw: 0.55 });
  // the hanging end (front, right of center), striped red / black / green, with fringe
  const tx = 8.0;
  const tw = 3.4;
  const top = 3.6;
  const bot = 9.7;
  s.push({ d: poly([[tx, top], [tx + tw, top - 0.3], [tx + tw + 0.3, bot], [tx + 0.2, bot]]), fill: K_GREEN, stroke: INK, sw: 0.55 });
  const stripes = [K_GREEN, K_RED, K_BLACK, K_GREEN, K_RED];
  const sh = (bot - top - 0.4) / stripes.length;
  stripes.forEach((c, i) => {
    const y0 = top + 0.2 + i * sh;
    const k0 = (y0 - top) / (bot - top);
    const k1 = (y0 + sh - top) / (bot - top);
    s.push({ d: poly([[tx + 0.2 * k0, y0 - 0.3 * (1 - k0)], [tx + tw + 0.3 * k0, y0 - 0.3 * (1 - k0) - 0.0], [tx + tw + 0.3 * k1, y0 + sh], [tx + 0.2 * k1, y0 + sh]]), fill: c });
  });
  s.push({ d: poly([[tx, top], [tx + tw, top - 0.3], [tx + tw + 0.3, bot], [tx + 0.2, bot]]), stroke: INK, sw: 0.55 });
  for (let i = 0; i < 5; i++) {
    const x = tx + 0.5 + i * ((tw - 0.4) / 4);
    s.push({ d: poly([[x, bot], [x + 0.1, bot + 1.0]], false), stroke: INK, sw: 0.55 });
    s.push({ d: poly([[x, bot + 0.1], [x + 0.1, bot + 0.85]], false), stroke: i % 2 ? K_RED : '#f2c14e', sw: 0.3 });
  }
  // the knot where the end comes out of the wrap
  s.push({ d: ellipse(tx + tw / 2, top + 0.3, 2.0, 1.25, -8), fill: K_RED, stroke: INK, sw: 0.5 });
  s.push({ d: `M${tx + tw / 2 - 1.1},${top - 0.1}Q${tx + tw / 2},${top + 0.7} ${tx + tw / 2 + 1.2},${top}`, stroke: '#ff8a7a', sw: 0.28, op: 0.8 });
  // highlight on the wrap
  s.push({ d: `M2.0,2.3Q4.0,3.7 6.0,4.0`, stroke: '#7fd39a', sw: 0.3, op: 0.7 });
  return { w: W, h: 11, shapes: s };
}

// ═════════════════════════════ WINTER SOLSTICE ═════════════════════════════

/** Background "Longest Night": snowy evergreens under a starry sky with aurora ribbons, a crescent moon and a lantern in the snow. */
function longestNight(): VecArt {
  const s: VecShape[] = [];
  s.push({ d: rect(0, 0, 36, 36), fill: '#0b1236' });
  s.push({ d: rect(0, 12, 36, 24), fill: '#121c4c' });
  s.push({ d: rect(0, 20, 36, 16), fill: '#1a2a63' });
  // aurora ribbons
  s.push({ d: `M-1,10C6,4 12,12 19,6C25,1 30,7 37,3L37,6C30,10 25,4 19,9C12,15 6,7 -1,13Z`, fill: '#3fe0a8', op: 0.28 });
  s.push({ d: `M-1,13C7,8 12,15 20,10C26,6 31,11 37,8L37,9.6C31,12.6 26,8 20,11.8C12,16.6 7,10 -1,14.6Z`, fill: '#9b7bff', op: 0.25 });
  s.push({ d: `M-1,8.6C6,3.4 12,10.6 19,5.2C25,0.8 30,5.6 37,2.4`, stroke: '#a8ffe0', sw: 0.35, op: 0.6 });
  // stars
  for (const [x, y, r, t] of [[3, 3, 0.9, 0], [10, 1.8, 0.7, 0.5], [16, 4, 0.55, 1.0], [24, 2.2, 0.8, 0.3], [6.5, 16, 0.55, 0.8], [33, 14, 0.6, 1.2]] as [number, number, number, number][]) s.push({ d: star(x, y, r), fill: '#ffffff', twinkle: t });
  for (const [x, y] of [[1.5, 7], [13, 7.5], [20, 1], [27.5, 9], [34.5, 11], [8, 11.5], [22, 13]] as P[]) s.push({ d: circle(x, y, 0.22), fill: '#ffffff' });
  // crescent moon (top right)
  const mx = 31;
  const my = 4.6;
  const mr = 2.6;
  s.push(...glow(mx - 0.5, my, 4.2, '#fff1b0', 0.08));
  s.push({ d: `M${mx},${my - mr}A${mr} ${mr} 0 1 0 ${mx},${my + mr}A${mr * 1.25} ${mr * 1.25} 0 0 1 ${mx},${my - mr}Z`, fill: '#fff1b0', stroke: '#ffe27a', sw: 0.2 });
  // far hills + forest
  s.push({ d: `M-1,24Q8,19.5 18,22.5Q28,19 37,22L37,36L-1,36Z`, fill: '#2c3f7c' });
  s.push(...pine(2.6, 27, 13, 6.4, '#1d5a45', '#0e3a2c'));
  s.push(...pine(7.4, 25, 9.5, 5.0, '#24684f', '#0e3a2c'));
  s.push(...pine(33.4, 27, 13.5, 6.6, '#1d5a45', '#0e3a2c'));
  s.push(...pine(28.6, 25, 9, 4.8, '#24684f', '#0e3a2c'));
  // snow ground
  s.push({ d: `M-1,28Q10,25.4 18,27Q27,25.2 37,27.6L37,36L-1,36Z`, fill: '#eef4ff', stroke: '#c9d6ef', sw: 0.3 });
  s.push({ d: `M-1,31Q12,29.4 22,31Q30,29.8 37,31`, stroke: '#d5e0f5', sw: 0.5 });
  // lantern glowing in the snow (bottom right)
  s.push(...glow(31.2, 29.6, 4.2, '#ffcf6b', 0.16));
  s.push(...lanternShapes(29.4, 25.4, 0.62));
  return { w: 36, h: 36, shapes: s };
}

/** A small metal lantern with a glowing candle (top-left x/y, scale k: k=1 → 6 × 9.6). */
function lanternShapes(x: number, y: number, k: number): VecShape[] {
  const X = (v: number) => x + v * k;
  const Y = (v: number) => y + v * k;
  const DK = '#2c3550';
  const s: VecShape[] = [];
  s.push({ d: `M${X(1.6)},${Y(2.0)}C${X(1.6)},${Y(-0.2)} ${X(4.4)},${Y(-0.2)} ${X(4.4)},${Y(2.0)}`, stroke: INK, sw: 0.75 * k });
  s.push({ d: `M${X(1.6)},${Y(2.0)}C${X(1.6)},${Y(-0.2)} ${X(4.4)},${Y(-0.2)} ${X(4.4)},${Y(2.0)}`, stroke: '#9aa6c4', sw: 0.35 * k });
  s.push({ d: poly([[X(0.6), Y(3.2)], [X(3.0), Y(1.6)], [X(5.4), Y(3.2)]]), fill: DK, stroke: INK, sw: 0.5 * k });
  s.push({ d: rect(X(0.9), Y(3.2), 4.2 * k, 5.0 * k, 0.3 * k), fill: '#ffe39a', stroke: INK, sw: 0.5 * k });
  s.push({ d: rect(X(1.3), Y(3.6), 3.4 * k, 4.2 * k), fill: '#ffd060' });
  s.push({ d: circle(X(3.0), Y(5.6), 1.6 * k), fill: '#fff6c9', op: 0.9 });
  s.push({ d: rect(X(2.65), Y(5.9), 0.7 * k, 1.8 * k), fill: '#ffffff', stroke: '#c9a24a', sw: 0.15 * k });
  s.push(...flame(X(3.0), Y(5.85), 1.5 * k, 0.4));
  s.push({ d: poly([[X(3.0), Y(3.2)], [X(3.0), Y(8.2)]], false), stroke: DK, sw: 0.35 * k });
  s.push({ d: rect(X(0.6), Y(8.2), 4.8 * k, 1.1 * k, 0.3 * k), fill: DK, stroke: INK, sw: 0.5 * k });
  return s;
}

/** Accessory "Starlight Lantern": held by its ring. */
function starlightLantern(): VecArt {
  const s: VecShape[] = [...glow(5.5, 9.4, 5.2, '#ffd36b', 0.14), ...lanternShapes(1.6, 0.6, 1.3)];
  return { w: 11, h: 14, shapes: s };
}

// ═════════════════════════════ NEW YEAR'S ═════════════════════════════

/** Rounded stroke digits in a 1 × 1.6 box. */
const DIGITS: Record<string, P[][]> = {
  '0': [[[0.5, 0], [0.9, 0.25], [1, 0.8], [0.9, 1.35], [0.5, 1.6], [0.1, 1.35], [0, 0.8], [0.1, 0.25], [0.5, 0]]],
  '1': [[[0.2, 0.35], [0.6, 0], [0.6, 1.6]], [[0.25, 1.6], [0.95, 1.6]]],
  '2': [[[0.05, 0.38], [0.25, 0.07], [0.55, 0], [0.85, 0.1], [0.97, 0.4], [0.85, 0.75], [0.05, 1.6], [1, 1.6]]],
  '3': [[[0.05, 0.15], [0.5, 0], [0.9, 0.2], [0.9, 0.55], [0.45, 0.78], [0.95, 1.0], [0.95, 1.4], [0.5, 1.6], [0.05, 1.45]]],
  '4': [[[0.75, 1.6], [0.75, 0], [0, 1.1], [1, 1.1]]],
  '5': [[[0.95, 0], [0.15, 0], [0.08, 0.7], [0.5, 0.6], [0.9, 0.8], [0.95, 1.2], [0.7, 1.55], [0.3, 1.6], [0.05, 1.45]]],
  '6': [[[0.85, 0.1], [0.5, 0], [0.15, 0.3], [0.03, 0.9], [0.15, 1.45], [0.5, 1.6], [0.85, 1.45], [0.95, 1.1], [0.8, 0.8], [0.5, 0.72], [0.15, 0.85], [0.05, 1.0]]],
  '7': [[[0, 0], [1, 0], [0.35, 1.6]]],
  '8': [[[0.5, 0.75], [0.12, 0.55], [0.12, 0.2], [0.5, 0], [0.88, 0.2], [0.88, 0.55], [0.5, 0.75], [0.05, 1.0], [0.05, 1.4], [0.5, 1.6], [0.95, 1.4], [0.95, 1.0], [0.5, 0.75]]],
  '9': [[[0.15, 1.5], [0.5, 1.6], [0.85, 1.3], [0.97, 0.7], [0.85, 0.15], [0.5, 0], [0.15, 0.15], [0.05, 0.5], [0.2, 0.8], [0.5, 0.88], [0.85, 0.75], [0.95, 0.6]]],
};

/** "2027" as stroke paths: top-left (x, y), each digit w wide (height 1.6w), gap between digits. */
export function digitPaths(text: string, x: number, y: number, w: number, gap: number): string[] {
  const out: string[] = [];
  [...text].forEach((ch, i) => {
    const ox = x + i * (w + gap);
    for (const line of DIGITS[ch] ?? []) out.push(poly(line.map(([a, b]) => [ox + a * w, y + b * w] as P), false));
  });
  return out;
}

/** Hat "New Year's Party Hat": shiny gold-and-navy cone with the year on a band. */
export function newYearHat(year: number): VecArt {
  const W = 13;
  const cx = W / 2;
  const tipY = 2.6;
  const baseY = 12.6;
  const hw = 5.4;
  const s: VecShape[] = [];
  const at = (y: number) => (hw * (y - tipY)) / (baseY - tipY);
  const cone = `M${cx},${tipY}L${cx + hw},${baseY}Q${cx},${baseY + 1.3} ${cx - hw},${baseY}Z`;
  s.push({ d: cone, fill: '#1d2b6b', stroke: INK, sw: 0.7 });
  // gold diagonal stripes
  for (const y0 of [4.4, 6.5]) {
    const y1 = y0 + 0.95;
    s.push({ d: poly([[cx - at(y0), y0 + 0.6], [cx + at(y0), y0 - 0.35], [cx + at(y1), y1 - 0.35], [cx - at(y1), y1 + 0.6]]), fill: '#f2c14e' });
  }
  // year band
  const bandTop = 8.5;
  const bandBot = 11.7;
  s.push({ d: poly([[cx - at(bandTop), bandTop], [cx + at(bandTop), bandTop], [cx + at(bandBot), bandBot], [cx - at(bandBot), bandBot]]), fill: '#f2c14e', stroke: INK, sw: 0.4 });
  const label = String(year).slice(-4);
  const dw = 1.22;
  const gap = 0.36;
  const tw = label.length * dw + (label.length - 1) * gap;
  for (const d of digitPaths(label, cx - tw / 2, bandTop + 0.62, dw, gap)) s.push({ d, stroke: '#1d2b6b', sw: 0.46 });
  // shine + right shadow
  s.push({ d: `M${cx - 1.0},${tipY + 2.0}L${cx - 2.6},${bandTop - 0.6}`, stroke: '#ffffff', sw: 0.45, op: 0.55 });
  s.push({ d: `M${cx},${tipY}L${cx + hw},${baseY}Q${cx + hw * 0.6},${baseY + 0.8} ${cx + 1.6},${baseY + 0.7}Z`, fill: '#0b143f', op: 0.22 });
  s.push({ d: cone, stroke: INK, sw: 0.7 });
  // fringe trim
  s.push({ d: `M${cx - hw - 0.3},${baseY - 0.2}Q${cx},${baseY + 1.8} ${cx + hw + 0.3},${baseY - 0.2}`, stroke: INK, sw: 1.4 });
  s.push({ d: `M${cx - hw - 0.3},${baseY - 0.2}Q${cx},${baseY + 1.8} ${cx + hw + 0.3},${baseY - 0.2}`, stroke: '#f2c14e', sw: 0.75 });
  // gold tinsel pom-pom
  s.push({ d: fluffy(cx, 1.75, 1.6, 10, 0.3), fill: '#f2c14e', stroke: INK, sw: 0.5 });
  s.push({ d: star(cx - 0.4, 1.45, 0.65), fill: '#fff6c9' });
  return { w: W, h: 14, shapes: s };
}

/** Accessory "Party Popper": a striped cone bursting confetti and streamers. */
function partyPopper(): VecArt {
  const s: VecShape[] = [];
  const CONF = ['#ff5a5a', '#ffd23f', '#5ad1ff', '#7dff7a', '#ff8ad8', '#b98bff'];
  // streamers
  s.push({ d: `M7.0,6.4C7.4,4.0 5.0,3.6 5.6,1.4`, stroke: '#ff8ad8', sw: 0.55 });
  s.push({ d: `M8.2,6.8C10.0,5.0 9.0,2.8 11.4,1.6`, stroke: '#5ad1ff', sw: 0.55 });
  s.push({ d: `M8.8,7.6C11.0,7.4 11.6,5.6 13.2,6.0`, stroke: '#ffd23f', sw: 0.55 });
  // confetti
  const bits: [number, number, number][] = [[3.2, 3.0, 20], [8.2, 0.8, -30], [12.6, 3.0, 45], [4.6, 6.0, -10], [10.6, 4.6, 70], [6.6, 3.0, 0], [12.4, 8.4, 30], [2.0, 5.2, 60], [9.6, 2.4, 15]];
  bits.forEach(([x, y, r], i) => s.push({ d: ellipse(x, y, 0.55, 0.3, r), fill: CONF[i % CONF.length], twinkle: (i % 3) * 0.4 }));
  for (const [x, y] of [[5.0, 1.6], [11.0, 6.4], [3.6, 7.8]] as P[]) s.push({ d: star(x, y, 0.6), fill: '#ffd23f' });
  // cone (pointing down-left, mouth up-right)
  const cone = `M1.6,15.4L6.2,7.0Q8.6,8.8 10.0,10.8Z`;
  s.push({ d: cone, fill: '#f2c14e', stroke: INK, sw: 0.65 });
  s.push({ d: poly([[2.9, 13.0], [8.4, 9.4], [9.0, 10.0], [3.4, 14.0]]), fill: '#1d2b6b' });
  s.push({ d: poly([[4.3, 10.6], [7.0, 8.1], [7.7, 8.6], [4.8, 11.5]]), fill: '#1d2b6b' });
  s.push({ d: cone, stroke: INK, sw: 0.65 });
  s.push({ d: ellipse(8.1, 8.9, 2.2, 0.75, 38), fill: '#fff1b0', stroke: INK, sw: 0.5 });
  // string pull
  s.push({ d: `M1.6,15.4C1.0,15.9 1.4,16.4 0.8,16.8`, stroke: '#ff5a5a', sw: 0.4 });
  return { w: 14, h: 17, shapes: s };
}

/** Background "Midnight Fireworks": fireworks over a night skyline and a clock tower at midnight. */
function midnightFireworks(): VecArt {
  const s: VecShape[] = [];
  s.push({ d: rect(0, 0, 36, 36), fill: '#0b1236' });
  s.push({ d: rect(0, 14, 36, 22), fill: '#141c4a' });
  s.push({ d: rect(0, 22, 36, 14), fill: '#1f2a62' });
  s.push(...burst(8.6, 6.0, 4.6, '#ffd23f', 14, 0));
  s.push(...burst(28.4, 5.6, 4.2, '#ff6fae', 12, 0.5));
  s.push(...burst(33.2, 15.4, 2.6, '#5ad1ff', 10, 0.9));
  s.push(...burst(17.6, 2.0, 2.2, '#7dff7a', 9, 1.2));
  for (const [x, y] of [[2, 2], [14, 8], [22, 10], [34, 2], [3, 13]] as P[]) s.push({ d: circle(x, y, 0.2), fill: '#ffffff' });
  // skyline
  const BLD = '#26306a';
  const BLD2 = '#2f3b7e';
  const blds: [number, number, number, string][] = [[-0.5, 22, 6, BLD2], [9, 25, 5, BLD], [13.5, 21, 5.5, BLD2], [18.5, 24, 5, BLD], [23, 19.6, 5, BLD2], [27.5, 23, 4.5, BLD], [31.5, 20.6, 5, BLD2]];
  for (const [x, y, w, c] of blds) {
    s.push({ d: rect(x, y, w, 36 - y), fill: c, stroke: INK, sw: 0.4 });
    for (let wy = y + 1.2; wy < 34; wy += 2.2) for (let wx = x + 0.9; wx < x + w - 0.8; wx += 1.6) if ((wx * 3 + wy * 7) % 5 < 3) s.push({ d: rect(wx, wy, 0.75, 0.95), fill: '#ffd98a', op: 0.85 });
  }
  // clock tower (left) at midnight: both hands up
  const tx = 4.6;
  s.push({ d: rect(tx - 3.0, 12.4, 6.0, 24), fill: '#384584', stroke: INK, sw: 0.5 });
  s.push({ d: poly([[tx - 3.6, 12.6], [tx, 8.6], [tx + 3.6, 12.6]]), fill: '#2b3670', stroke: INK, sw: 0.5 });
  s.push(...glow(tx, 16.6, 4.0, '#fff1b0', 0.1));
  s.push({ d: circle(tx, 16.6, 2.5), fill: '#fff6d8', stroke: INK, sw: 0.5 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    s.push({ d: circle(tx + Math.sin(a) * 1.95, 16.6 - Math.cos(a) * 1.95, i % 3 ? 0.13 : 0.22), fill: INK });
  }
  s.push({ d: poly([[tx, 16.6], [tx, 14.7]], false), stroke: INK, sw: 0.4 });
  s.push({ d: poly([[tx + 0.05, 16.6], [tx + 0.05, 15.3]], false), stroke: INK, sw: 0.55 });
  s.push({ d: circle(tx, 16.6, 0.3), fill: '#d0453e' });
  for (const wy of [21, 25, 29]) s.push({ d: rect(tx - 0.8, wy, 1.6, 2.0, 0.6), fill: '#ffd98a', op: 0.9 });
  return { w: 36, h: 36, shapes: s };
}

// ═════════════════════════════ THREE KINGS DAY ═════════════════════════════

/** Background "Rosca de Reyes": a ring-shaped sweet bread with candied fruit, hot chocolate and a bright star in the window. */
function roscaDeReyes(): VecArt {
  const s: VecShape[] = [];
  s.push({ d: rect(0, 0, 36, 36), fill: '#6b2f2a' });
  for (let x = 1; x < 36; x += 3.6) s.push({ d: rect(x, 0, 1.2, 28), fill: '#76362f' });
  // window with the bright star
  windowFrame(s, 0.6, 0.8, 15.6, 15.4, '#e8c58a', '#a8824a', (gx, gy, gw, gh) => {
    s.push({ d: rect(gx, gy, gw, gh), fill: '#0d1a48' });
    s.push({ d: rect(gx, gy + gh * 0.6, gw, gh * 0.4), fill: '#16286a' });
    const sx = gx + gw * 0.62;
    const sy = gy + gh * 0.3;
    s.push(...glow(sx, sy, 5.2, '#fff1b0', 0.12));
    s.push({ d: star(sx, sy, 3.4), fill: '#fff6c9', stroke: '#ffe27a', sw: 0.2, twinkle: 0 });
    s.push({ d: circle(sx, sy, 0.9), fill: '#ffffff' });
    for (const [x, y] of [[1.6, 1.8], [3.4, 8.2], [10.4, 10.2], [2.4, 5.4], [11.8, 1.2]] as P[]) s.push({ d: circle(gx + x, gy + y, 0.25), fill: '#ffffff' });
    // little rooftops far away
    s.push({ d: `M${gx},${gy + gh}L${gx},${gy + gh - 2}L${gx + 3},${gy + gh - 3.2}L${gx + 6},${gy + gh - 2}L${gx + 6},${gy + gh - 2.6}L${gx + 9.5},${gy + gh - 3.8}L${gx + gw},${gy + gh - 2.4}L${gx + gw},${gy + gh}Z`, fill: '#0a1238' });
  }, false);
  s.push({ d: rect(0, 15.6, 17.2, 1.5, 0.3), fill: '#f2d29a', stroke: INK, sw: 0.6 });
  // string of paper-cut flag bunting along the top right
  s.push({ d: `M17,1.4Q26.5,4.4 36,1.6`, stroke: '#f2d29a', sw: 0.3 });
  const FLAGS = ['#ffd23f', '#2f9e64', '#ff6fae', '#5ad1ff', '#ff8a3c'];
  for (let i = 0; i < 6; i++) {
    const x = 18.2 + i * 3.1;
    const y = 1.4 + 3.0 * (1 - ((x - 26.5) / 9.5) ** 2) * 0.95 + 0.1;
    s.push({ d: poly([[x - 1.1, y], [x + 1.1, y], [x, y + 2.0]]), fill: FLAGS[i % FLAGS.length], stroke: INK, sw: 0.3 });
  }

  // table with a tablecloth
  s.push({ d: rect(-0.5, 27.4, 37, 9), fill: '#f6efe2', stroke: INK, sw: 0.6 });
  for (let x = 0; x < 36; x += 3) s.push({ d: rect(x, 27.4, 1.5, 9), fill: '#e2574c', op: 0.35 });
  s.push({ d: rect(-0.5, 27.4, 37, 1.2), fill: '#ffffff', op: 0.6 });

  // 0036: the rosca sits low in the bottom-right corner and the hot chocolate bottom-left, the spots every
  // character leaves open, so they peek out beside the avatar (the ring's hole stays visible on all 7).
  // the rosca: an oval ring of golden bread with candied fruit and sugar-paste stripes
  const rx = 32.4;
  const ry = 32.0;
  const RX = 6.4;
  const RY = 3.6;
  s.push({ d: ellipse(rx, ry + 1.0, RX + 0.4, RY - 0.6), fill: '#1b2340', op: 0.18 });
  s.push({ d: ellipse(rx, ry, RX, RY), fill: '#d98a3a', stroke: INK, sw: 0.6 });
  s.push({ d: ellipse(rx, ry - 0.3, RX - 0.6, RY - 0.65), fill: '#e8a650' });
  s.push({ d: ellipse(rx, ry - 0.1, 2.5, 1.05), fill: '#f6efe2', stroke: INK, sw: 0.5 });
  s.push({ d: ellipse(rx, ry + 0.25, 2.3, 0.7), fill: '#b86a28', op: 0.6 });
  // sugar-paste stripes (light) + candied fruit (red, green, orange) around the ring
  const ring = (t: number): P => [rx + Math.cos(t) * (RX - 1.85), ry - 0.3 + Math.sin(t) * (RY - 1.35)];
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2 + 0.2;
    const [x, y] = ring(t);
    s.push({ d: ellipse(x, y, 1.3, 0.48, (Math.atan2(Math.sin(t) * 2.3, Math.cos(t) * 5) * 180) / Math.PI + 90), fill: '#fff4dc', stroke: '#d9b98a', sw: 0.15 });
    const [fx, fy] = ring(t + Math.PI / 8);
    const FRUIT = ['#d0283d', '#2f9e64', '#ff8a3c'];
    s.push({ d: ellipse(fx, fy, 0.8, 0.5, 20 * i), fill: FRUIT[i % 3], stroke: INK, sw: 0.18 });
  }
  s.push({ d: `M${rx - 5.2},${ry - 1.9}Q${rx - 2},${ry - 3.7} ${rx + 2},${ry - 3.5}`, stroke: '#fff1c9', sw: 0.4, op: 0.8 });

  // two mugs of hot chocolate, low in the bottom-left corner
  const mug = (x: number, y: number, c: string) => {
    s.push({ d: `M${x + 3.0},${y + 1.0}C${x + 4.8},${y + 0.8} ${x + 4.8},${y + 3.4} ${x + 3.0},${y + 3.2}`, stroke: INK, sw: 1.2 });
    s.push({ d: `M${x + 3.0},${y + 1.0}C${x + 4.8},${y + 0.8} ${x + 4.8},${y + 3.4} ${x + 3.0},${y + 3.2}`, stroke: c, sw: 0.5 });
    s.push({ d: rect(x, y, 3.4, 4.2, 0.5), fill: c, stroke: INK, sw: 0.5 });
    s.push({ d: ellipse(x + 1.7, y + 0.3, 1.5, 0.45), fill: '#6b3a1e' });
    for (const k of [0.6, 1.8]) s.push({ d: `M${x + k},${y - 0.6}C${x + k - 0.6},${y - 1.4} ${x + k + 0.6},${y - 2.0} ${x + k},${y - 2.8}`, stroke: '#ffffff', sw: 0.35, op: 0.7, steam: k });
  };
  mug(3.4, 29.0, '#ffd23f');
  mug(0.3, 30.6, '#2f6fd6');
  return { w: 36, h: 36, shapes: s };
}

// ═════════════════════════════ LUNAR NEW YEAR ═════════════════════════════

/** A round red paper lantern hanging from (cx, top) with gold caps and a tassel; r = body radius. */
function redLantern(cx: number, top: number, r: number, twinkle?: number): VecShape[] {
  const cy = top + 1.0 + r * 0.8;
  const s: VecShape[] = [
    { d: poly([[cx, top - 4], [cx, top]], false), stroke: '#c9a24a', sw: 0.25 },
    ...glow(cx, cy, r * 1.5, '#ff6a3d', 0.1),
    { d: rect(cx - r * 0.45, top, r * 0.9, 1.0, 0.2), fill: '#f2c14e', stroke: INK, sw: 0.35 },
    { d: ellipse(cx, cy, r, r * 0.8), fill: '#e0352b', stroke: INK, sw: 0.5, twinkle },
  ];
  for (const k of [0.35, 0.72]) s.push({ d: ellipse(cx, cy, r * k, r * 0.8), stroke: '#a51f1f', sw: 0.25 });
  s.push({ d: ellipse(cx - r * 0.45, cy - r * 0.2, r * 0.18, r * 0.42), fill: '#ff9a7a', op: 0.6 });
  s.push({ d: rect(cx - r * 0.45, cy + r * 0.8 - 0.2, r * 0.9, 0.9, 0.2), fill: '#f2c14e', stroke: INK, sw: 0.35 });
  s.push({ d: poly([[cx, cy + r * 0.8 + 0.7], [cx, cy + r * 0.8 + 1.4]], false), stroke: '#f2c14e', sw: 0.35 });
  s.push({ d: poly([[cx - 0.45, cy + r * 0.8 + 1.3], [cx + 0.45, cy + r * 0.8 + 1.3], [cx + 0.6, cy + r * 0.8 + 3.6], [cx - 0.6, cy + r * 0.8 + 3.6]]), fill: '#e0352b', stroke: '#a51f1f', sw: 0.2 });
  return s;
}

/** Background "Lanterns & Fireworks": red lanterns with gold tassels, plum blossoms and fireworks. */
function lanternsFireworks(): VecArt {
  const s: VecShape[] = [];
  s.push({ d: rect(0, 0, 36, 36), fill: '#1a1240' });
  s.push({ d: rect(0, 16, 36, 20), fill: '#241650' });
  s.push({ d: rect(0, 26, 36, 10), fill: '#2e1a5a' });
  s.push(...burst(29, 15, 4.2, '#ffd23f', 14, 0.3));
  s.push(...burst(8, 17.5, 3.0, '#ff6a5a', 12, 0.8));
  s.push(...burst(20, 13, 2.4, '#ffb3c8', 10, 1.2));
  for (const [x, y] of [[14, 9], [24, 9.5], [34, 9], [3, 12], [17, 18]] as P[]) s.push({ d: circle(x, y, 0.22), fill: '#ffffff' });
  // rope + lanterns
  s.push({ d: `M-1,2.6Q18,6.6 37,2.6`, stroke: '#c9a24a', sw: 0.45 });
  const rope = (x: number) => 2.6 + 4 * (1 - ((x - 18) / 19) ** 2);
  s.push(...redLantern(4.0, rope(4.0) + 0.2, 2.6, 0));
  s.push(...redLantern(11.6, rope(11.6) + 0.2, 2.2, 0.6));
  s.push(...redLantern(24.4, rope(24.4) + 0.2, 2.2, 0.3));
  s.push(...redLantern(32.0, rope(32.0) + 0.2, 2.6, 0.9));
  // plum blossom branches (bottom left + right)
  const branch = (d: string) => {
    s.push({ d, stroke: '#3a2416', sw: 0.95 });
    s.push({ d, stroke: '#5e3a22', sw: 0.45 });
  };
  branch(`M-1,33C3,30 4,27 8,25.4M3.2,29.4C4.6,29.6 6,30.4 7,31.6`);
  branch(`M37,30.6C33,28.6 31.6,25.6 27.6,24.6M33,27.6C32,29.2 31.6,30.4 32,32`);
  const blossom = (x: number, y: number, r: number) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      s.push({ d: circle(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.52), fill: '#ffb3c8', stroke: '#d9708f', sw: 0.15 });
    }
    s.push({ d: circle(x, y, r * 0.3), fill: '#ffe27a' });
  };
  for (const [x, y, r] of [[8.2, 25.2, 1.2], [5.4, 27.0, 1.0], [7.2, 31.6, 1.1], [2.2, 30.6, 0.9], [27.6, 24.4, 1.2], [30.6, 26.0, 1.0], [32.2, 31.8, 1.1], [34.8, 28.8, 0.9]] as [number, number, number][]) blossom(x, y, r);
  for (const [x, y] of [[4.0, 29.0], [29.2, 25.6], [33.4, 28.0]] as P[]) s.push({ d: circle(x, y, 0.45), fill: '#ff8fb0' });
  return { w: 36, h: 36, shapes: s };
}

/** Accessory "Red Envelope": a small red envelope with a gold border and a round gold emblem. */
function redEnvelope(): VecArt {
  const s: VecShape[] = [];
  s.push({ d: rect(1.4, 1.2, 9.0, 12.6, 0.7), fill: '#d8262b', stroke: INK, sw: 0.65 });
  s.push({ d: rect(2.2, 2.0, 7.4, 11.0, 0.4), stroke: '#f2c14e', sw: 0.35 });
  // flap
  s.push({ d: `M1.5,1.8L5.9,6.0L10.3,1.8`, fill: '#b51d22', stroke: INK, sw: 0.5 });
  s.push({ d: `M2.3,2.2L5.9,5.4L9.5,2.2`, stroke: '#f2c14e', sw: 0.3 });
  // gold emblem: coin with a square hole + little cloud swirls
  s.push({ d: circle(5.9, 8.6, 2.1), fill: '#f2c14e', stroke: INK, sw: 0.45 });
  s.push({ d: circle(5.9, 8.6, 1.5), stroke: '#c98a2a', sw: 0.25 });
  s.push({ d: rect(5.35, 8.05, 1.1, 1.1, 0.15), fill: '#d8262b' });
  for (const [x, y] of [[3.0, 12.0], [8.8, 12.0]] as P[]) s.push({ d: `M${x - 0.6},${y}a0.4,0.4 0 1 1 0.6,-0.4a0.4,0.4 0 1 1 0.6,0.4`, stroke: '#f2c14e', sw: 0.28 });
  s.push({ d: poly([[2.4, 4.2], [2.4, 11.6]], false), stroke: '#ff6a6a', sw: 0.35, op: 0.6 });
  return { w: 12, h: 15, shapes: s };
}

export const FESTIVAL_OF_LIGHTS_VEC = festivalOfLights();
export const DREIDEL_VEC = dreidel();
export const SNOWY_PINE_VEC = snowyPine();
export const HOLIDAY_HAT_VEC = holidayHat();
export const CANDY_CANE_VEC = candyCane();
export const KINARA_GLOW_VEC = kinaraGlow();
export const LONGEST_NIGHT_VEC = longestNight();
export const STARLIGHT_LANTERN_VEC = starlightLantern();
export const PARTY_POPPER_VEC = partyPopper();
export const MIDNIGHT_FIREWORKS_VEC = midnightFireworks();
export const ROSCA_VEC = roscaDeReyes();
export const LANTERNS_FIREWORKS_VEC = lanternsFireworks();
export const RED_ENVELOPE_VEC = redEnvelope();
export const UNITY_CUP_VEC = unityCup();
export const ZAWADI_VEC = zawadi();
export const KWANZAA_SCARF_VEC = kwanzaaScarf();

/**
 * Vector cosmetics (0034): a few wardrobe pieces are drawn as flat-color paths instead of pixel grids so
 * they read as real objects. Units are the same as the pixel art (1 = one character pixel), so a VecArt
 * slots into composeLayers() exactly like a grid of the same w×h. The same path strings feed SVG
 * (<path d>) and canvas (new Path2D(d)), so the share-card renderers draw them identically.
 */
export interface VecShape {
  d: string;
  fill?: string;
  stroke?: string;
  /** Stroke width in art units. */
  sw?: number;
  /** Opacity 0..1 (glows, shading). */
  op?: number;
  /** Seconds of delay for a twinkling shape (stars); static in canvas + reduced motion. */
  twinkle?: number;
}

export interface VecArt {
  w: number;
  h: number;
  shapes: VecShape[];
}

/** Dark outline used by every character. */
export const INK = '#1b2340';

const n = (v: number) => String(Math.round(v * 100) / 100);
export const pt = (x: number, y: number) => `${n(x)},${n(y)}`;

/** Closed (or open) polyline through points. */
export function poly(points: [number, number][], closed = true): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${pt(x, y)}`).join('') + (closed ? 'Z' : '');
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0): string {
  const r = (rot * Math.PI) / 180;
  const dx = Math.cos(r) * rx;
  const dy = Math.sin(r) * rx;
  return `M${pt(cx - dx, cy - dy)}A${n(rx)} ${n(ry)} ${n(rot)} 1 0 ${pt(cx + dx, cy + dy)}A${n(rx)} ${n(ry)} ${n(rot)} 1 0 ${pt(cx - dx, cy - dy)}Z`;
}

export const circle = (cx: number, cy: number, r: number) => ellipse(cx, cy, r, r);

export function rect(x: number, y: number, w: number, h: number, rr = 0): string {
  if (!rr) return poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  const r = Math.min(rr, w / 2, h / 2);
  return (
    `M${pt(x + r, y)}L${pt(x + w - r, y)}Q${pt(x + w, y)} ${pt(x + w, y + r)}L${pt(x + w, y + h - r)}` +
    `Q${pt(x + w, y + h)} ${pt(x + w - r, y + h)}L${pt(x + r, y + h)}Q${pt(x, y + h)} ${pt(x, y + h - r)}` +
    `L${pt(x, y + r)}Q${pt(x, y)} ${pt(x + r, y)}Z`
  );
}

/** A 4-point twinkle star. */
export function star(cx: number, cy: number, s: number): string {
  const k = s * 0.28;
  return poly([[cx, cy - s], [cx + k, cy - k], [cx + s, cy], [cx + k, cy + k], [cx, cy + s], [cx - k, cy + k], [cx - s, cy], [cx - k, cy - k]]);
}

/** Bumpy "fluffy" circle (pom-poms). */
export function fluffy(cx: number, cy: number, r: number, bumps = 9, depth = 0.13): string {
  const pts: [number, number][] = [];
  const steps = bumps * 8;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r * (1 - depth * 0.5 + depth * Math.abs(Math.cos((a * bumps) / 2)));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return poly(pts);
}

/** Recolors every shape (locked = grayscale). */
export function mapColors(art: VecArt, f: (hex: string) => string): VecArt {
  return { ...art, shapes: art.shapes.map((s) => ({ ...s, fill: s.fill && f(s.fill), stroke: s.stroke && f(s.stroke) })) };
}

/** Paints a VecArt on a canvas with its top-left at (x, y) and `scale` px per art unit. */
export function drawVec(ctx: CanvasRenderingContext2D, art: VecArt, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const s of art.shapes) {
    const p = new Path2D(s.d);
    ctx.globalAlpha = s.op ?? 1;
    if (s.fill) {
      ctx.fillStyle = s.fill;
      ctx.fill(p);
    }
    if (s.stroke) {
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.sw ?? 0.6;
      ctx.stroke(p);
    }
  }
  ctx.restore();
}

/** Turns pixel grids into SVG rects (runs of the same color merged per row). */
import type { CSSProperties } from 'react';

export function gridRects(grid: string[], palette: Record<string, string>, ox = 0, oy = 0, key = 'g'): JSX.Element[] {
  const rects: JSX.Element[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const fill = palette[ch];
      if (fill) rects.push(<rect key={`${key}-${x}-${y}`} x={ox + x} y={oy + y} width={end - x + 0.02} height={1.02} fill={fill} />);
      x = end;
    }
  });
  return rects;
}

/** Twinkle for sparkle layers (theme.css owns the `blink` keyframes and the reduced-motion switch). */
export const twinkleStyle = (delay: number): CSSProperties => ({ animation: 'blink 1.4s steps(1) infinite', animationDelay: `${delay}s` });

/** Grayscale + lighten a palette (locked items). */
export function grayPalette(p: Record<string, string>, lift = 0.35): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, hex] of Object.entries(p)) {
    const n = parseInt(hex.slice(1), 16);
    const l = 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255);
    const v = Math.round(l + (255 - l) * lift);
    out[k] = `rgb(${v},${v},${Math.min(255, v + 8)})`;
  }
  return out;
}

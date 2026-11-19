/** 0034: the reveal glows in the player's campus color (Duke #00539b, UNC #7bafd4, NC State #cc0000 from config). */
import type { CSSProperties } from 'react';
import { CAMPUSES, type CampusId } from '../../config';

export function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function campaignColorGlow(campus: CampusId | undefined): CSSProperties {
  const c = CAMPUSES.find((x) => x.id === campus)?.color ?? '#f2b33d';
  return { '--rr-glow': hexToRgba(c, 0.85), '--rr-glow-soft': hexToRgba(c, 0.38), '--rr-campus': c } as CSSProperties;
}

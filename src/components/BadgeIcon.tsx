/** 16×16 pixel badge emblem. Locked badges are a faded grayscale medallion with a little padlock. */
import { badgeById } from '../lib/badges';
import { LOCK, badgeGrid } from './cosmetics/badgeArt';
import { ALL_COLORS } from './cosmetics/compose';
import { gridRects, grayPalette } from './cosmetics/Pixels';

const GRAY = grayPalette(ALL_COLORS, 0.45);

export function BadgeIcon({ id, earned = true, size = 48, className, title }: { id: string; earned?: boolean; size?: number; className?: string; title?: string }) {
  const name = badgeById(id)?.name ?? id;
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} shapeRendering="crispEdges" role="img" aria-label={title ?? (earned ? name : `${name} (locked)`)}>
      {gridRects(badgeGrid(id), earned ? ALL_COLORS : GRAY)}
      {!earned && gridRects(LOCK, ALL_COLORS, 11, 10, 'lock')}
    </svg>
  );
}

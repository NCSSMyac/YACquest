/**
 * Easier wardrobe access: a gold "👕 Wardrobe" pill and a tiny pencil badge for the player's own avatar.
 * Both open /prize?tab=wardrobe (no new nav tab). The pill shows the same "NEW" tag as the Prize tab while an
 * event outfit hasn't been seen in the Wardrobe yet (useEventRewards).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useEventRewards } from '../lib/useEventRewards';

export const WARDROBE_PATH = '/prize?tab=wardrobe';

/** "👕 Wardrobe" pill, used beside the avatar on Home. */
export function WardrobeButton({ className = '' }: { className?: string }) {
  const isNew = useEventRewards().unseen.length > 0;
  return (
    <Link to={WARDROBE_PATH} className={`btn small wardrobe-pill ${className}`.trim()} aria-label={isNew ? 'Open wardrobe (new outfit)' : 'Open wardrobe'}>
      <span aria-hidden="true">👕</span>Wardrobe
      {isNew && <span className="new-dot wardrobe-pill-new" aria-hidden="true">NEW</span>}
    </Link>
  );
}

/** 10×10 pixel pencil. */
function PencilIcon() {
  return (
    <svg viewBox="0 0 10 10" width="12" height="12" aria-hidden="true" focusable="false" shapeRendering="crispEdges">
      <rect x="7" y="0" width="2" height="1" fill="#f0727a" />
      <rect x="6" y="1" width="4" height="1" fill="#f0727a" />
      <rect x="7" y="2" width="2" height="1" fill="#fff" />
      <rect x="6" y="2" width="1" height="1" fill="#fff" />
      <rect x="5" y="3" width="3" height="1" fill="#ffd34d" />
      <rect x="4" y="4" width="3" height="1" fill="#ffd34d" />
      <rect x="3" y="5" width="3" height="1" fill="#ffd34d" />
      <rect x="2" y="6" width="3" height="1" fill="#ffd34d" />
      <rect x="1" y="7" width="3" height="1" fill="#f3d6a4" />
      <rect x="1" y="8" width="2" height="1" fill="#f3d6a4" />
      <rect x="0" y="9" width="1" height="1" fill="#fff" />
    </svg>
  );
}

/** Pencil badge drawn on the avatar's corner. Decorative unless `asLink`. */
export function OutfitBadge({ asLink = false }: { asLink?: boolean }) {
  if (!asLink) return <span className="outfit-badge" aria-hidden="true"><PencilIcon /></span>;
  return (
    <Link to={WARDROBE_PATH} className="outfit-badge-link" aria-label="Change outfit">
      <span className="outfit-badge"><PencilIcon /></span>
    </Link>
  );
}

/** The player's own avatar as a link to the Wardrobe, with the pencil badge (Me). */
export function AvatarWardrobeLink({ children }: { children: ReactNode }) {
  return (
    <Link to={WARDROBE_PATH} className="avatar-wardrobe-link" aria-label="Change outfit">
      {children}
      <OutfitBadge />
    </Link>
  );
}

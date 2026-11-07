/**
 * A thin campus-colored frame around an avatar (Ranks, Adventurer of the Month), with an optional
 * tiny campus tag. The fill is CAMPUSES[].color; a 1px contrast ring (navy on light pages, pale on dark)
 * keeps light UNC blue and dark Duke blue visible in both themes (see .campus-frame in theme.css).
 */
import type { CSSProperties, ReactNode } from 'react';
import { CAMPUSES, type CampusId } from '../config';

const ABBR: Record<CampusId, string> = { duke: 'DUKE', unc: 'UNC', ncsu: 'NCSU' };

export function CampusFrame({ campus, label = false, children }: { campus: CampusId; label?: boolean; children: ReactNode }) {
  const c = CAMPUSES.find((x) => x.id === campus);
  const name = c?.name ?? campus;
  return (
    <span className={`campus-frame cf-${campus}`} title={name} style={{ '--cf': c?.color ?? 'var(--navy-800)' } as CSSProperties}>
      {children}
      {label && <span className="campus-tag" aria-hidden>{ABBR[campus] ?? name}</span>}
    </span>
  );
}

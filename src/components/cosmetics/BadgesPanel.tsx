import { useState } from 'react';
import { BADGES, badgeById } from '../../lib/badges';
import { staffBadgeById } from '../../lib/staffRewards';
import type { BadgeProgress } from '../../types';
import { BadgeIcon } from '../BadgeIcon';
import { Empty, ErrorText, Loading, Modal, Panel, ProgressBar } from '../ui';

const defOf = (id: string) => badgeById(id) ?? staffBadgeById(id);
/** Hero of the Week shows how many times (×1, ×2 …) instead of a capped progress. */
const heroTimes = (b: BadgeProgress) => (b.id === 'hero_week' && b.progress > 0 ? `×${b.progress}` : null);

/** `staffBadges` (0020): Council badges, only ever passed for admins/chairs. */
export function BadgesPanel({ badges, error, staffBadges }: { badges: BadgeProgress[] | null; error?: string | null; staffBadges?: BadgeProgress[] | null }) {
  const [open, setOpen] = useState<BadgeProgress | null>(null);
  if (!badges) return error ? <ErrorText error={error} /> : <Loading lines={3} />;
  if (!badges.length) return <Empty>No badges yet. Check back soon!</Empty>;
  const count = badges.filter((b) => b.earned).length;
  const def = open ? defOf(open.id) : undefined;

  return (
    <div className="stack">
      <Panel tone="navy" className="adm-item">
        <div className="spread">
          <div>
            <div className="pixel" style={{ fontSize: 20, color: 'var(--gold-300)' }} aria-live="polite">{count} / {BADGES.length} collected</div>
            <span style={{ fontSize: 13, color: 'var(--blue-300)' }}>Tap a badge for details. Badges unlock new looks in the Wardrobe.</span>
          </div>
          <BadgeIcon id="legend" earned={count === BADGES.length} size={40} title="" />
        </div>
      </Panel>

      <BadgeGrid badges={badges} onOpen={setOpen} />

      {staffBadges && staffBadges.length > 0 && (
        <>
          <h2 className="pixel" style={{ margin: '8px 0 0', fontSize: 18 }}>🏛️ Council badges</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Staff only: for reviewing, announcing, hosting and being Hero of the Week. Counts all-time.</p>
          <BadgeGrid badges={staffBadges} onOpen={setOpen} />
        </>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={def?.name ?? 'Badge'} tone={open?.earned ? 'gold' : undefined}>
        {open && (
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
            <BadgeIcon id={open.id} earned={open.earned} size={128} className={open.earned ? 'bob' : undefined} />
            <strong className="pixel" style={{ fontSize: 15 }}>{open.earned ? 'Collected!' : 'Not yet'}</strong>
            <p style={{ margin: 0 }}>{def?.how}</p>
            {open.earned && def?.flavor && <p style={{ margin: 0, fontStyle: 'italic' }}>“{def.flavor}”</p>}
            {heroTimes(open) ? (
              <strong className="pixel" style={{ fontSize: 15 }}>Crowned {heroTimes(open)}</strong>
            ) : (
              <div style={{ width: '100%' }}>
                <ProgressBar value={open.progress} max={open.goal} label={`${open.progress} / ${open.goal}`} />
              </div>
            )}
            <button className="btn small" onClick={() => setOpen(null)}>Close</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function BadgeGrid({ badges, onOpen }: { badges: BadgeProgress[]; onOpen: (b: BadgeProgress) => void }) {
  return (
    <div className="badge-grid">
      {badges.map((b) => {
        const d = defOf(b.id);
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onOpen(b)}
            className="panel flat"
            aria-label={`${d?.name ?? b.id}: ${b.earned ? 'collected' : `locked, ${b.progress} of ${b.goal}`}`}
            style={{
              margin: 0,
              padding: '8px 2px 6px',
              cursor: 'pointer',
              textAlign: 'center',
              color: 'var(--text)',
              minWidth: 0,
              background: b.earned ? 'radial-gradient(circle at 50% 38%, rgba(255,217,122,0.85), rgba(255,217,122,0) 70%), var(--surface)' : 'var(--surface)',
              borderColor: b.earned ? 'var(--gold-500)' : undefined,
              boxShadow: b.earned ? '0 0 0 2px var(--navy-900), 0 4px 0 var(--navy-900)' : undefined,
            }}
          >
            <BadgeIcon id={b.id} earned={b.earned} size={44} className={b.earned ? 'bob' : undefined} title="" />
            <div style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.15, marginTop: 3, opacity: b.earned ? 1 : 0.7, overflowWrap: 'anywhere' }}>{d?.name ?? b.id}</div>
            {heroTimes(b) && <div className="pixel" style={{ fontSize: 13, color: 'var(--text)' }}>{heroTimes(b)}</div>}
            {!b.earned && b.goal > 1 && (
              <div className="muted" style={{ fontSize: 10 }}>{b.progress}/{b.goal}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

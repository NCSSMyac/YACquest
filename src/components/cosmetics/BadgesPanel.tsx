import { useState } from 'react';
import { BADGES, badgeById } from '../../lib/badges';
import type { BadgeProgress } from '../../types';
import { BadgeIcon } from '../BadgeIcon';
import { Empty, ErrorText, Loading, Modal, Panel, ProgressBar } from '../ui';

export function BadgesPanel({ badges, error }: { badges: BadgeProgress[] | null; error?: string | null }) {
  const [open, setOpen] = useState<BadgeProgress | null>(null);
  if (!badges) return error ? <ErrorText error={error} /> : <Loading lines={3} />;
  if (!badges.length) return <Empty>No badges yet. Check back soon!</Empty>;
  const count = badges.filter((b) => b.earned).length;
  const def = open ? badgeById(open.id) : undefined;

  return (
    <div className="stack">
      <Panel tone="navy">
        <div className="spread">
          <div>
            <div className="pixel" style={{ fontSize: 22, color: 'var(--gold-300)' }} aria-live="polite">{count} / {BADGES.length} collected</div>
            <span style={{ fontSize: 14, color: 'var(--blue-300)' }}>Just for fun: badges unlock new looks in the Wardrobe.</span>
          </div>
          <BadgeIcon id="legend" earned={count === BADGES.length} size={48} title="" />
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 10 }}>
        {badges.map((b) => {
          const d = badgeById(b.id);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setOpen(b)}
              className="panel flat"
              aria-label={`${d?.name ?? b.id}: ${b.earned ? 'collected' : `locked, ${b.progress} of ${b.goal}`}`}
              style={{
                margin: 0,
                padding: '10px 4px 8px',
                cursor: 'pointer',
                textAlign: 'center',
                color: 'var(--text)',
                minWidth: 0,
                background: b.earned ? 'radial-gradient(circle at 50% 38%, rgba(255,217,122,0.85), rgba(255,217,122,0) 70%), var(--surface)' : 'var(--surface)',
                borderColor: b.earned ? 'var(--gold-500)' : undefined,
                boxShadow: b.earned ? '0 0 0 2px var(--navy-900), 0 4px 0 var(--navy-900)' : undefined,
              }}
            >
              <BadgeIcon id={b.id} earned={b.earned} size={56} className={b.earned ? 'bob' : undefined} title="" />
              <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.2, marginTop: 4, opacity: b.earned ? 1 : 0.65 }}>{d?.name ?? b.id}</div>
              {!b.earned && b.goal > 1 && (
                <div className="muted" style={{ fontSize: 11 }}>{b.progress}/{b.goal}</div>
              )}
            </button>
          );
        })}
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} title={def?.name ?? 'Badge'} tone={open?.earned ? 'gold' : undefined}>
        {open && (
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
            <BadgeIcon id={open.id} earned={open.earned} size={128} className={open.earned ? 'bob' : undefined} />
            <strong className="pixel" style={{ fontSize: 15 }}>{open.earned ? 'Collected!' : 'Not yet'}</strong>
            <p style={{ margin: 0 }}>{def?.how}</p>
            {open.earned && def?.flavor && <p style={{ margin: 0, fontStyle: 'italic' }}>“{def.flavor}”</p>}
            <div style={{ width: '100%' }}>
              <ProgressBar value={open.progress} max={open.goal} label={`${open.progress} / ${open.goal}`} />
            </div>
            <button className="btn small" onClick={() => setOpen(null)}>Close</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

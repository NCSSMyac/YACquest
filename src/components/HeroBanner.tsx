/**
 * STAFF ONLY (0020): "🦸 Hero of the Week" banner + the Hall of Heroes list. Rendered only inside
 * Admin screens (admins + chairs); the data comes from api.heroBoard(), which refuses participants.
 */
import type { HeroBoard } from '../types';
import { fmtDate } from '../lib/format';
import { Avatar } from './Avatar';
import { Empty, Panel } from './ui';

export function HeroBannerPanel({ board }: { board: HeroBoard }) {
  const h = board.current;
  return (
    <section className="panel gold" aria-label="Hero of the Week">
      {h ? (
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <Avatar id={h.avatar} look={h.look} campus={h.campus} size={64} hero title={h.displayName} />
          <div style={{ minWidth: 0 }}>
            <div className="pixel" style={{ fontSize: 15 }}>🦸 Hero of the Week</div>
            <b style={{ fontSize: 20, display: 'block', wordBreak: 'break-word' }}>{h.displayName}</b>
            {h.note && <div style={{ fontSize: 15, wordBreak: 'break-word' }}>“{h.note}”</div>}
            <div style={{ fontSize: 13, opacity: 0.85 }}>Crowned {fmtDate(h.crownedAt)}{h.crownedByName ? ` by ${h.crownedByName}` : ''}</div>
          </div>
        </div>
      ) : (
        <div>
          <div className="pixel" style={{ fontSize: 15 }}>🦸 Hero of the Week</div>
          <p style={{ margin: '4px 0 0' }}>No hero right now. Chairs crown one at the next YAC meeting (Admin → Heroes).</p>
        </div>
      )}
    </section>
  );
}

export function HallOfHeroes({ board, limit }: { board: HeroBoard; limit?: number }) {
  const list = limit ? board.history.slice(0, limit) : board.history;
  return (
    <Panel title="🏛️ Hall of Heroes">
      {list.length === 0 ? (
        <Empty>No heroes crowned yet.</Empty>
      ) : (
        <ul className="list">
          {list.map((r) => (
            <li key={r.id} className="stack" style={{ gap: 2 }}>
              <div className="spread" style={{ gap: 8 }}>
                <strong style={{ minWidth: 0, wordBreak: 'break-word' }}>{r.displayName}{!r.endedAt && <span className="chip t1" style={{ marginLeft: 6 }}>Reigning</span>}</strong>
                <span className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.crownedAt)}</span>
              </div>
              {r.note && <span className="muted" style={{ wordBreak: 'break-word' }}>{r.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * Admin → Council (0021): view-only team board for ALL staff (admins + chairs). One card per staff
 * member: full look (+ hero glow), role, Council badges, unlocked Council items, Golden Yak.
 * Data comes from council_board(), which refuses participants on the server.
 * Crowning / granting stays in Admin → Heroes (chairs).
 */
import { Link } from 'react-router-dom';
import * as api from '../../api';
import { Avatar } from '../../components/Avatar';
import { BadgeIcon } from '../../components/BadgeIcon';
import { Empty, ErrorText, Loading, Panel } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { STAFF_COSMETICS, staffBadgeById } from '../../lib/staffRewards';
import { useAsync } from '../../lib/useAsync';
import type { BadgeProgress, CouncilMember } from '../../types';

const badgeLabel = (b: BadgeProgress) => (b.id === 'hero_week' ? (b.progress > 0 ? `×${b.progress}` : '×0') : b.earned ? '✓' : `${b.progress}/${b.goal}`);

export default function Council() {
  const isChair = useAuth().user?.role === 'chair';
  const board = useAsync(() => api.councilBoard(), [], { live: true });
  if (board.loading && !board.data) return <Loading lines={4} />;
  if (!board.data) return <ErrorText error={board.error ?? 'Could not load.'} />;
  return (
    <div className="stack">
      <Panel title="🏛️ The Council" action={isChair ? <Link to="/admin/heroes" className="btn small ghost" style={{ textDecoration: 'none' }}>Manage in Heroes</Link> : undefined}>
        <p style={{ margin: 0, fontSize: 15 }}>Everyone on the YAC team, their look and their Council badges. Staff only; participants never see this.</p>
      </Panel>
      {board.data.length === 0 ? <Empty>No team yet.</Empty> : board.data.map((m) => <CouncilCard key={m.userId} m={m} />)}
    </div>
  );
}

function CouncilCard({ m }: { m: CouncilMember }) {
  return (
    <section className={`panel${m.isHero ? ' gold' : ''}`} aria-label={m.displayName}>
      <div className="row" style={{ gap: 12, alignItems: 'center' }}>
        <Avatar id={m.avatar} look={m.look} campus={m.campus} size={64} hero={m.isHero} title={m.displayName} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <b style={{ fontSize: 18, display: 'block', wordBreak: 'break-word' }}>{m.displayName}</b>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            <span className={`chip ${m.role === 'chair' ? 't1' : 't2'}`}>{m.role === 'chair' ? 'YACquest Chair' : 'Admin'}</span>
            {m.isHero && <span className="chip t1">🦸 Hero of the Week</span>}
            {m.legendary && <span className="chip legendary">★ Legendary</span>}
          </div>
          <div style={{ fontSize: 14, marginTop: 4 }}>{m.unlockCount} / {STAFF_COSMETICS.length} Council items</div>
        </div>
      </div>
      <ul aria-label={`${m.displayName}'s Council badges`} style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 4 }}>
        {m.badges.map((b) => {
          const name = staffBadgeById(b.id)?.name ?? b.id;
          return (
            <li key={b.id} style={{ textAlign: 'center', minWidth: 0 }} title={name}>
              <BadgeIcon id={b.id} earned={b.earned} size={36} title={`${name}: ${b.earned ? 'earned' : 'locked'}, ${badgeLabel(b)}`} />
              <div style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.15, opacity: b.earned ? 1 : 0.7 }}>{badgeLabel(b)}</div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

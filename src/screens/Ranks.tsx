import { useState } from 'react';
import * as api from '../api';
import { CAMPUSES, campusName } from '../config';
import { useAuth } from '../lib/auth';
import { useAsync } from '../lib/useAsync';
import { Sprite } from '../components/Sprite';
import { Avatar } from '../components/Avatar';
import { CampusFrame } from '../components/CampusFrame';
import { Empty, ErrorText, Loading, Panel } from '../components/ui';
import type { LeaderRow } from '../types';

type TabId = 'top' | 'campus' | 'cup';
const TABS: { id: TabId; label: string }[] = [
  { id: 'top', label: 'Overall' },
  { id: 'campus', label: 'By Campus' },
  { id: 'cup', label: 'Campus Cup' },
];
const MEDAL = ['#f2b33d', '#c0c8d6', '#cd7f32'];
const campusColor = (id: string) => CAMPUSES.find((c) => c.id === id)?.color ?? 'var(--navy-800)';
/** Readable text color for a campus (theme-aware; see --campus-* in theme.css). */
const campusText = (id: string) => `campus-${id}`;

export default function Ranks() {
  const [tab, setTab] = useState<TabId>('top');
  return (
    <div className="stack">
      <h1 className="pixel" style={{ margin: 0 }}>Leaderboard</h1>
      <div className="tabs" role="tablist" aria-label="Rankings">
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`ranks-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="ranks-panel" onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div id="ranks-panel" role="tabpanel" aria-labelledby={`ranks-tab-${tab}`} className="stack">
        {tab === 'top' && <Top />}
        {tab === 'campus' && <ByCampus />}
        {tab === 'cup' && <Cup />}
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medal = rank <= 3;
  return (
    <span
      className="chip"
      style={{ minWidth: 34, justifyContent: 'center', color: medal ? '#14213d' : 'var(--text)', background: medal ? MEDAL[rank - 1] : undefined, borderColor: medal ? '#14213d' : 'var(--text-soft)' }}
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  );
}

function Row({ r, me }: { r: LeaderRow; me: boolean }) {
  return (
    <li className="row" style={{ background: me ? 'var(--me-row)' : undefined, padding: '8px 6px' }} aria-current={me ? 'true' : undefined}>
      <RankBadge rank={r.rank} />
      <CampusFrame campus={r.campus}><Avatar id={r.avatar} look={r.look} campus={r.campus} size={32} /></CampusFrame>
      <strong style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.displayName}{me ? ' (you)' : ''}</strong>
      <span className={`chip ${campusText(r.campus)}`}>{campusName(r.campus)}</span>
      <span className="pixel" style={{ fontSize: 15 }}>{r.points}</span>
    </li>
  );
}

const TOP_STEP = 10;
const TOP_MAX = 50;

function Top() {
  const { user } = useAuth();
  const [limit, setLimit] = useState(TOP_STEP);
  const top = useAsync(() => api.leaderboard(limit), [limit], { live: true });
  const mine = useAsync(() => api.myRank(), [], { live: true });
  if (top.loading && !top.data) return <Loading lines={5} />;
  if (top.error && !top.data) return <ErrorText error={top.error} />;
  const rows = top.data ?? [];
  if (!rows.length) return <Empty>No adventurers on the board yet. Be the first!</Empty>;
  const inTop = rows.some((r) => r.userId === user?.id);
  // The server may return fewer rows than asked (end of the board, or a cap): then there's nothing more to load.
  const canMore = rows.length >= limit && limit < TOP_MAX;
  return (
    <>
      {mine.data && <YouBar r={mine.data} />}
      <Panel>
        <ol className="list" style={{ listStyle: 'none' }}>
          {rows.map((r) => <Row key={r.userId} r={r} me={r.userId === user?.id} />)}
          {!inTop && mine.data && (
            <>
              <li aria-hidden="true" style={{ textAlign: 'center', padding: 2 }} className="muted">…</li>
              <Row r={mine.data} me />
            </>
          )}
        </ol>
        {canMore && (
          <button type="button" className="show-more" disabled={top.loading} onClick={() => setLimit((l) => Math.min(TOP_MAX, l + TOP_STEP))}>
            <span>{top.loading ? 'Loading…' : `Show top ${Math.min(TOP_MAX, limit + TOP_STEP)}`}</span>
          </button>
        )}
      </Panel>
    </>
  );
}

/** Small sticky "You: #27 · 70 pts" bar so your own rank stays in view while scrolling the board. */
function YouBar({ r }: { r: LeaderRow }) {
  return (
    <div className="you-bar" role="status" aria-label={`Your rank: ${r.rank}, ${r.points} points`}>
      <CampusFrame campus={r.campus}><Avatar id={r.avatar} look={r.look} campus={r.campus} size={28} /></CampusFrame>
      <span className="you-text">You · {campusName(r.campus)}</span>
      <b>#{r.rank}</b>
      <span style={{ fontWeight: 800 }}>{r.points} pts</span>
    </div>
  );
}

function ByCampus() {
  const { user } = useAuth();
  const { data, loading, error } = useAsync(() => api.campusLeaders(3), [], { live: true });
  if (loading && !data) return <Loading lines={4} />;
  if (error) return <ErrorText error={error} />;
  return (
    <>
      {CAMPUSES.map((c) => (
        <Panel key={c.id} title={<span className={campusText(c.id)}>{c.full}</span>}>
          <div style={{ borderLeft: `6px solid ${c.color}`, paddingLeft: 6 }}>
            {data?.[c.id]?.length ? (
              <ol className="list">
                {data[c.id].map((r, i) => <Row key={r.userId} r={{ ...r, rank: i + 1 }} me={r.userId === user?.id} />)}
              </ol>
            ) : (
              <Empty>No one here yet.</Empty>
            )}
          </div>
        </Panel>
      ))}
    </>
  );
}

function Cup() {
  const { data, loading, error } = useAsync(() => api.campusCup(), [], { live: true });
  if (loading && !data) return <Loading lines={3} />;
  if (error) return <ErrorText error={error} />;
  const rows = (data ?? []).slice().sort((a, b) => b.perCapita - a.perCapita);
  const max = Math.max(1, ...rows.map((r) => r.perCapita));
  return (
    <Panel title="Campus Cup">
      <div className="stack">
        {rows.map((r, i) => (
          <div key={r.campus} className="stack" style={{ gap: 4 }}>
            <div className="spread">
              <strong>{i === 0 && r.perCapita > 0 && <Sprite id="trophy" size={28} className="bob" />} {campusName(r.campus)}</strong>
              <span className="pixel" style={{ fontSize: 15 }}>{r.perCapita.toFixed(1)} avg</span>
            </div>
            <div style={{ background: 'rgba(127,140,170,0.18)', border: '3px solid var(--border)', height: 22 }} role="img" aria-label={`${campusName(r.campus)} average ${r.perCapita.toFixed(1)} points per person`}>
              <div style={{ width: `${(r.perCapita / max) * 100}%`, height: '100%', background: campusColor(r.campus) }} />
            </div>
            <span className="muted">{r.members} members · {r.totalPoints} total pts</span>
          </div>
        ))}
        <p className="muted" style={{ margin: 0 }}>The Cup is scored per person (average points), so campus size doesn’t matter. Every adventurer counts!</p>
      </div>
    </Panel>
  );
}

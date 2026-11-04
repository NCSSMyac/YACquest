import * as api from '../../api';
import { PRIZE, campusName } from '../../config';
import { Empty, ErrorText, Loading, Panel, ProgressBar } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';

export default function AdminHome() {
  const o = useAsync(() => api.adminOverview(), [], { live: true });
  const rep = useAsync(() => api.weeklyReportPreview(), []);
  if (o.loading && !o.data) return <Loading lines={4} />;
  if (!o.data) return <ErrorText error={o.error ?? 'Could not load.'} />;
  const d = o.data;
  const tiles = [
    ['Participants', d.participants],
    ['Active this week', d.activeThisWeek],
    ['Points this week', d.pointsThisWeek],
    ['Pending reviews', d.pendingReviews],
    ['New sign-ups', d.newSignupsThisWeek],
  ] as const;
  return (
    <div className="stack">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
        {tiles.map(([l, n]) => (
          <div key={l} className="panel stat">
            <div className="num">{n}</div>
            <div className="lbl">{l}</div>
          </div>
        ))}
      </div>

      <Panel title="Prize race">
        <ProgressBar value={d.prize.total - d.prize.remaining} max={d.prize.total} label={`${d.prize.remaining} of ${d.prize.total} spots left`} />
        <p className="muted">First {d.prize.total} to reach {d.prize.goal} pts win a {PRIZE.name}.</p>
        {d.prize.claims.length === 0 ? (
          <Empty>No one has qualified yet.</Empty>
        ) : (
          <ul className="list">
            {d.prize.claims.map((c) => (
              <li key={c.spot} className="spread">
                <span>#{c.spot} {c.displayName} · {campusName(c.campus)}</span>
                <span className="muted">{fmtDate(c.qualifiedAt)} · {c.status.replace('_', ' ')}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Close to the goal">
        {d.nearGoal.length === 0 ? (
          <Empty>Nobody within range yet.</Empty>
        ) : (
          <ul className="list">
            {d.nearGoal.map((r) => (
              <li key={r.userId} className="spread">
                <span>{r.displayName} · {campusName(r.campus)}</span>
                <span>{r.points} / {d.prize.goal} <span className="muted">({d.prize.goal - r.points} to go)</span></span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Weekly email preview">
        {rep.data ? (
          <div style={{ background: '#fff', color: '#222', border: '2px solid #ccc', padding: 14, fontFamily: 'Georgia, serif', fontSize: 17 }}>
            <div style={{ borderBottom: '1px solid #ddd', paddingBottom: 8, marginBottom: 10, fontSize: 14, color: '#666' }}>
              <div><b>To:</b> YAC leads &amp; chair</div>
              <div><b>Subject:</b> {rep.data.subject}</div>
            </div>
            {rep.data.lines.map((l, i) => <p key={i} style={{ margin: '0 0 8px' }}>{l}</p>)}
          </div>
        ) : rep.error ? <ErrorText error={rep.error} /> : <Loading />}
      </Panel>
    </div>
  );
}

import { Link } from 'react-router-dom';
import * as api from '../../api';
import { useAuth } from '../../lib/auth';
import { PRIZE, campusName } from '../../config';
import { Empty, ErrorText, Loading, Panel, ProgressBar } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';

export default function AdminHome() {
  const o = useAsync(() => api.adminOverview(), [], { live: true });
  const rep = useAsync(() => api.weeklyReportPreview(), []);
  const isChair = useAuth().user?.role === 'chair';
  if (o.loading && !o.data) return <Loading lines={4} />;
  if (!o.data) return <ErrorText error={o.error ?? 'Could not load.'} />;
  const d = o.data;
  const tiles = [
    ['Participants', d.participants],
    ['Active this week', d.activeThisWeek],
    ['Points this week', d.pointsThisWeek],
    ['Pending reviews', d.pendingReviews],
    ['New sign-ups this week', d.newSignupsThisWeek],
  ] as const;
  return (
    <div className="stack">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        {tiles.map(([l, n], i) => (
          <div key={l} className="panel stat" style={i === tiles.length - 1 && tiles.length % 2 ? { gridColumn: '1 / -1' } : undefined}>
            <div className="num">{n}</div>
            <div className="lbl">{l}</div>
          </div>
        ))}
      </div>

      <Panel title="Prize race">
        <ProgressBar value={d.prize.total - d.prize.remaining} max={d.prize.total} label={`${d.prize.remaining} of ${d.prize.total} spots left`} />
        <p className="muted" style={{ margin: '8px 0' }}>First {d.prize.total} to reach {d.prize.goal} points win a {PRIZE.name}.</p>
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

      <Panel title="Weekly email preview" action={isChair ? <Link to="/admin/system" className="btn small ghost" style={{ textDecoration: 'none' }}>Settings</Link> : undefined}>
        {rep.data ? (
          <div className="stack" style={{ gap: 8 }}>
            <div style={{ fontSize: 15 }}>
              <div><strong>Subject:</strong> {rep.data.subject}</div>
              <div style={{ wordBreak: 'break-word' }}>
                <strong>To:</strong>{' '}
                {rep.data.recipients.length ? rep.data.recipients.join(', ') : <span className="muted">nobody yet — a chair can add recipients in Admin → System</span>}
              </div>
            </div>
            {rep.data.html ? (
              <iframe
                title="Weekly email preview"
                sandbox=""
                srcDoc={rep.data.html}
                style={{ width: '100%', height: 420, border: 'var(--px) solid var(--border)', background: '#fff' }}
              />
            ) : (
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, padding: 12, background: 'var(--paper)', border: 'var(--px) solid var(--border)', fontFamily: 'var(--font-body)', fontSize: 15 }}>{rep.data.text}</pre>
            )}
            <button className="btn small ghost" onClick={() => void rep.reload()}>Refresh preview</button>
          </div>
        ) : rep.error ? <ErrorText error={rep.error} /> : <Loading />}
      </Panel>
    </div>
  );
}

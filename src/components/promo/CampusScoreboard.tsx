/**
 * 0034 Live campus scoreboard: during a special series (3 days before its first event → 1 day after its
 * last), "☕ Brew & Quest check-ins: UNC 24 · NC State 11 · Duke 7" with mini bars in campus colors.
 * Participants only (the server counts). Refreshes every 30 s while the page is visible. Home + Admin.
 */
import { useEffect } from 'react';
import * as api from '../../api';
import { PROMO } from '../../config';
import { scoreboardLine, scoreboardRows } from '../../lib/promo';
import { useAsync } from '../../lib/useAsync';
import { Card } from '../Blocks';

export function CampusScoreboard({ admin = false }: { admin?: boolean }) {
  const { data, reload } = useAsync(() => api.rewardScoreboard(), []);
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (!t && document.visibilityState !== 'hidden') t = setInterval(() => void reload(), PROMO.scoreboardPollMs);
    };
    const stop = () => {
      if (t) clearInterval(t);
      t = undefined;
    };
    const onVis = () => (document.visibilityState === 'hidden' ? stop() : (void reload(), start()));
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reload]);
  if (!data) return null;
  const rows = scoreboardRows(data);
  const total = rows.reduce((n, r) => n + r.count, 0);
  return (
    <Card
      className="scoreboard"
      label={`${data.name} campus scoreboard`}
      title={<><span aria-hidden="true">{data.emoji} </span>{data.name} check-ins</>}
      action={<span className="chip neutral scoreboard-live"><span className="scoreboard-dot" aria-hidden="true" />Live</span>}
    >
      <p className="sr-only">{scoreboardLine(data)}</p>
      <ul className="scoreboard-rows" aria-hidden="true">
        {rows.map((r, i) => (
          <li key={r.campus} className={i === 0 && r.count > 0 ? 'lead' : undefined}>
            <span className="scoreboard-name">{i === 0 && r.count > 0 ? '👑 ' : ''}{r.name}</span>
            <span className="scoreboard-bar"><span style={{ width: `${r.pct}%`, background: r.color }} /></span>
            <b className="scoreboard-n">{r.count}</b>
          </li>
        ))}
      </ul>
      <p className="scoreboard-foot">
        {admin ? `${total} participant check-ins across ${data.events} events · staff not counted` : total ? 'Check in to put your campus on top!' : 'First check-in takes the lead!'}
      </p>
    </Card>
  );
}

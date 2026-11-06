import { useEffect } from 'react';
import * as api from '../api';
import { PageHeader } from '../components/Layout';
import { Sprite } from '../components/Sprite';
import { Empty, ErrorText, Loading, Panel } from '../components/ui';
import { timeAgo } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import type { NotificationKind } from '../types';

const KIND: Record<NotificationKind, { icon: string; color: string }> = {
  submission_approved: { icon: '✔', color: 'var(--green)' },
  submission_rejected: { icon: '✖', color: 'var(--red)' },
  points_adjusted: { icon: '★', color: 'var(--gold-500)' },
  prize_qualified: { icon: '🏆', color: 'var(--gold-500)' },
  prize_update: { icon: '🎁', color: 'var(--purple)' },
  announcement: { icon: '📣', color: 'var(--blue-500)' },
  // staff only (0020)
  hero_crowned: { icon: '🦸', color: 'var(--gold-500)' },
  staff_reward: { icon: '👑', color: 'var(--purple)' },
};

export default function Notifications() {
  const { data, loading, error, reload } = useAsync(() => api.notifications(), [], { live: true });
  const unread = data?.filter((n) => !n.read).length ?? 0;

  // Auto-mark read shortly after opening (the highlight stays until then).
  useEffect(() => {
    const t = setTimeout(() => {
      api.markNotificationsRead().then(reload).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markAll() {
    await api.markNotificationsRead();
    reload();
  }

  return (
    <div className="stack">
      <PageHeader title="Notifications" back />
      {unread > 0 && (
        <button className="btn small blue" onClick={markAll} style={{ alignSelf: 'flex-start' }}>Mark all read ({unread})</button>
      )}
      <ErrorText error={error} />
      {loading && !data ? (
        <Loading lines={3} />
      ) : data && data.length === 0 ? (
        <Panel>
          <Empty>
            <Sprite id="yak" size={64} className="bob" />
            <p>All quiet in the meadow. No notifications yet!</p>
          </Empty>
        </Panel>
      ) : (
        <ul className="list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data?.map((n) => {
            const k = KIND[n.kind] ?? KIND.announcement;
            return (
              <li key={n.id} style={{ padding: 0, border: 0 }}>
                <Panel tone={n.read ? 'flat' : 'gold'} className="">
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <span aria-hidden style={{ fontSize: 18, color: k.color, minWidth: 28, textAlign: 'center' }}>{k.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div className="spread" style={{ alignItems: 'flex-start' }}>
                        <b>{n.title}</b>
                        {!n.read && <span className="chip t1">New</span>}
                      </div>
                      <div>{n.body}</div>
                      <div className="muted" style={{ fontSize: 13 }}>{timeAgo(n.createdAt)}</div>
                    </div>
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

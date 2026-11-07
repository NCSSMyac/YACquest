import { useCallback, useEffect, useState } from 'react';
import * as api from '../../api';
import { Empty, ErrorText, Loading, Panel, useToast } from '../../components/ui';
import { describeAction } from '../../lib/actionText';
import { fmtDateTime, timeAgo } from '../../lib/format';
import { errorMessage } from '../../lib/useAsync';
import type { AdminAction } from '../../types';

const PAGE = 50;

const ICON: Record<string, string> = {
  points_added: 'chip approved',
  points_removed: 'chip rejected',
  submission_approved: 'chip approved',
  submission_rejected: 'chip rejected',
  role_changed: 'chip t1',
  prize_fulfilled: 'chip t1',
  prize_revoked: 'chip rejected',
  cycle_reset: 'chip rejected',
  hero_crowned: 'chip t1',
  hero_cleared: 'chip neutral',
  staff_reward_granted: 'chip t1',
  player_note_added: 'chip t2',
  player_note_deleted: 'chip neutral',
};
const TAG: Record<string, string> = {
  points_added: 'points',
  points_removed: 'points',
  submission_approved: 'review',
  submission_rejected: 'review',
  role_changed: 'team',
  event_created: 'event',
  event_updated: 'event',
  event_deleted: 'event',
  prize_fulfilled: 'prize',
  prize_revoked: 'prize',
  cycle_reset: 'cycle',
  report_settings_changed: 'email',
  hero_crowned: 'hero',
  hero_cleared: 'hero',
  staff_reward_granted: 'reward',
  player_note_added: 'note',
  player_note_deleted: 'note',
};

/** 0025: points rows that carry their ledger id (and aren't undo rows themselves) can be undone from here. */
const undoableId = (a: AdminAction): string | null =>
  (a.action === 'points_added' || a.action === 'points_removed') && a.details.ledgerId != null && a.details.undoOf == null ? String(a.details.ledgerId) : null;

export default function ActivityLog() {
  const [items, setItems] = useState<AdminAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const [undone, setUndone] = useState<Set<string>>(new Set());
  const [undoing, setUndoing] = useState<string | null>(null);

  async function undo(a: AdminAction, ledgerId: string) {
    const amt = Number(a.details.amount);
    if (!window.confirm(`Undo this change? ${a.targetName ?? 'They'} will get ${amt > 0 ? `−${amt}` : `+${-amt}`} points back to cancel it, with a notification.`)) return;
    setUndoing(ledgerId);
    try {
      const r = await api.undoPointsChange(ledgerId);
      setUndone((s) => new Set(s).add(ledgerId));
      toast(`Undone (${r.amount > 0 ? '+' : ''}${r.amount} pts).`, 'success');
      void loadFirst();
    } catch (e) {
      toast(errorMessage(e), 'error');
      if ((e as { code?: string }).code === 'already_undone') setUndone((s) => new Set(s).add(ledgerId));
    } finally {
      setUndoing(null);
    }
  }

  const loadFirst = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.adminActionLog({ limit: PAGE });
      setItems(page);
      setHasMore(page.length === PAGE);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  async function loadMore() {
    const last = items[items.length - 1];
    if (!last) return;
    setMore(true);
    setError(null);
    try {
      const page = await api.adminActionLog({ before: last.id, limit: PAGE });
      setItems((cur) => [...cur, ...page.filter((p) => !cur.some((c) => c.id === p.id))]);
      setHasMore(page.length === PAGE);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setMore(false);
    }
  }

  return (
    <Panel title="Admin activity log" action={<button className="btn small ghost" onClick={() => void loadFirst()} disabled={loading}>Refresh</button>}>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>Every points change, review, role change, event edit and prize update by an admin or YACquest Chair. Newest first. This log can’t be edited.</p>
      {loading && !items.length ? (
        <Loading lines={4} />
      ) : error && !items.length ? (
        <ErrorText error={error} />
      ) : !items.length ? (
        <Empty>Nothing logged yet.</Empty>
      ) : (
        <>
          <ul className="list">
            {items.map((a) => {
              const lid = undoableId(a);
              const undoneHere = lid != null && (undone.has(lid) || items.some((b) => b.details.undoOf != null && String(b.details.undoOf) === lid));
              return (
                <li key={a.id} className="stack" style={{ gap: 4 }}>
                  <span>{describeAction(a)}</span>
                  <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span className={ICON[a.action] ?? 'chip neutral'}>{a.details.undoOf != null ? 'undo' : TAG[a.action] ?? 'other'}</span>
                    <time className="muted" dateTime={a.createdAt} title={fmtDateTime(a.createdAt)} style={{ fontSize: 13 }}>
                      {timeAgo(a.createdAt)} · {fmtDateTime(a.createdAt)}
                    </time>
                    {lid && (undoneHere ? (
                      <span className="chip neutral">undone</span>
                    ) : (
                      <button type="button" className="btn small ghost undo-btn" disabled={undoing === lid} onClick={() => void undo(a, lid)} aria-label={`Undo: ${describeAction(a)}`}>
                        {undoing === lid ? 'Undoing…' : '↩ Undo'}
                      </button>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
          <ErrorText error={error} />
          {hasMore && (
            <button className="btn small ghost block" style={{ marginTop: 10 }} disabled={more} onClick={() => void loadMore()}>
              {more ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import * as api from '../../api';
import { ACTIVITIES, activityById } from '../../lib/activities';
import { PRIZE, TIER_POINTS, campusName } from '../../config';
import { Empty, ErrorText, Loading, Modal, useToast } from '../../components/ui';
import { fmtDateTime, fmtPts } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';

const gameWin = activityById('game_win')!;
const PLAYERS_STEP = 20;

export default function Players() {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<api.AdminUserRow | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setQuery(text), 250);
    return () => clearTimeout(t);
  }, [text]);
  const [limit, setLimit] = useState(PLAYERS_STEP);
  useEffect(() => setLimit(PLAYERS_STEP), [query]);
  const list = useAsync(() => api.searchUsers(query, limit), [query, limit], { live: true });
  // Fewer rows than asked means we've reached the end (or the server's cap).
  const canMore = !!list.data && list.data.length >= limit;

  return (
    <div className="stack">
      <label className="field">
        <span>Search players</span>
        <input className="input" type="search" placeholder="Name, username or email" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {list.loading && !list.data ? <Loading lines={3} /> : list.error ? <ErrorText error={list.error} /> : !list.data?.length ? (
        <Empty>No players found.</Empty>
      ) : (
        <>
        <p className="list-count">{query.trim() ? `${list.data.length}${canMore ? '+' : ''} found` : `Showing ${list.data.length}${canMore ? '' : ' (everyone)'} · search to find anyone`}</p>
        <ul className="list panel" style={{ padding: '4px 14px' }}>
          {list.data.map((u) => (
            <li key={u.id} style={{ padding: '2px 0' }}>
              <button type="button" className="row-btn" onClick={() => setSel(u)}>
                <span><strong>{u.displayName}</strong> <span className="muted">@{u.handle} · {campusName(u.campus)}</span></span>
                <strong>{u.points} pts</strong>
              </button>
            </li>
          ))}
        </ul>
        </>
      )}
      {canMore && (
        <button type="button" className="show-more" style={{ marginTop: 0 }} disabled={list.loading} onClick={() => setLimit((l) => l + PLAYERS_STEP)}>
          <span>{list.loading ? 'Loading…' : `Show ${PLAYERS_STEP} more players`}</span>
        </button>
      )}
      {sel && <PlayerModal key={sel.id} user={list.data?.find((u) => u.id === sel.id) ?? sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function PlayerModal({ user, onClose }: { user: api.AdminUserRow; onClose: () => void }) {
  const toast = useToast();
  const ledger = useAsync(() => api.userLedger(user.id), [user.id], { live: true });
  const [activityId, setActivityId] = useState(gameWin.id);
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [adjErr, setAdjErr] = useState<string | null>(null);
  const [newName, setNewName] = useState(user.displayName);
  const [renameErr, setRenameErr] = useState<string | null>(null);

  async function rename(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setRenameErr(null);
    try {
      await api.adminRenameUser(user.id, newName);
      toast(`Renamed to ${newName.trim()}.`, 'success');
    } catch (e) {
      setRenameErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function award(id: string, n: string) {
    setBusy(true);
    setErr(null);
    try {
      await api.awardActivity(user.id, id, n);
      toast(`+${TIER_POINTS[activityById(id)!.tier]} pts to ${user.displayName}`, 'success');
      setNote('');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function adjust(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setAdjErr(null);
    try {
      await api.adjustPoints(user.id, Number(amount), reason);
      toast('Points adjusted.', 'success');
      setAmount('');
      setReason('');
    } catch (e) {
      setAdjErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={user.displayName}>
      <div className="stack">
        <p className="muted wrap-anywhere">@{user.handle} · {campusName(user.campus)} · {user.role === 'chair' ? 'YACquest Chair' : user.role === 'admin' ? 'Admin' : 'Adventurer'} · {user.email}</p>
        <div className="stat panel"><div className="num">{user.points}</div><div className="lbl">points</div></div>

        <button className="btn green block" disabled={busy} onClick={() => award(gameWin.id, '')}>
          +{TIER_POINTS[gameWin.tier]} Game win
        </button>

        <form className="stack" onSubmit={(e) => { e.preventDefault(); void award(activityId, note); }}>
          <h3>Award activity</h3>
          <label className="field">
            <span>Activity</span>
            <select value={activityId} onChange={(e) => setActivityId(e.target.value)}>
              {ACTIVITIES.map((a) => <option key={a.id} value={a.id}>{a.title} (+{TIER_POINTS[a.tier]})</option>)}
            </select>
          </label>
          <label className="field"><span>Note (optional)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <ErrorText error={err} />
          <button className="btn" disabled={busy}>Award</button>
        </form>

        <form className="stack" onSubmit={adjust}>
          <h3>Adjust points</h3>
          <label className="field"><span>Amount (+ or −)</span><input className="input" type="number" step={1} min={-PRIZE.goal} max={TIER_POINTS[1]} value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
          <p className="muted" style={{ margin: 0 }}>Add at most +{TIER_POINTS[1]} at a time (one High-Impact action) so the prize race stays fair. Use a negative number (down to −{PRIZE.goal}) to remove points or fix mistakes.</p>
          <label className="field"><span>Reason (required)</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} required /></label>
          <p className="muted">The reason is shown to the participant in their notifications.</p>
          <ErrorText error={adjErr} />
          <button className="btn blue" disabled={busy || !amount || !reason.trim()}>Adjust</button>
        </form>

        <form className="stack" onSubmit={rename}>
          <h3>Rename</h3>
          <label className="field">
            <span>New display name</span>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={24} />
          </label>
          <p className="muted" style={{ margin: 0 }}>Fix a name that isn’t friendly. The player gets a notification.</p>
          <ErrorText error={renameErr} />
          <button className="btn" disabled={busy || newName.trim().length < 2 || newName.trim() === user.displayName}>Save name</button>
        </form>

        <h3>Points history</h3>
        {ledger.loading && !ledger.data ? <Loading /> : !ledger.data?.length ? <Empty>No entries yet.</Empty> : (
          <ul className="list">
            {ledger.data.map((l) => (
              <li key={l.id} className="spread">
                <span>{l.reason}<br /><span className="muted">{fmtDateTime(l.createdAt)}</span></span>
                <strong style={{ color: l.amount < 0 ? 'var(--red)' : 'var(--green)' }}>{fmtPts(l.amount)}</strong>
              </li>
            ))}
          </ul>
        )}
        <button className="btn ghost block" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import * as api from '../../api';
import { ACTIVITIES, activityById } from '../../lib/activities';
import { PRIZE, TIER_POINTS, campusName } from '../../config';
import { Empty, ErrorText, Loading, Modal, useToast } from '../../components/ui';
import { fmtDateTime, fmtPts } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';

const gameWin = activityById('game_win')!;

export default function Players() {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<api.AdminUserRow | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setQuery(text), 250);
    return () => clearTimeout(t);
  }, [text]);
  const list = useAsync(() => api.searchUsers(query), [query], { live: true });

  return (
    <div className="stack">
      <label className="field">
        <span>Search players</span>
        <input className="input" type="search" placeholder="Name, handle or email" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {list.loading && !list.data ? <Loading lines={3} /> : list.error ? <ErrorText error={list.error} /> : !list.data?.length ? (
        <Empty>No players found.</Empty>
      ) : (
        <ul className="list panel">
          {list.data.map((u) => (
            <li key={u.id}>
              <button className="btn ghost block" style={{ textAlign: 'left', justifyContent: 'space-between' }} onClick={() => setSel(u)}>
                <span>{u.displayName} <span className="muted">@{u.handle} · {campusName(u.campus)}</span></span>
                <span>{u.points} pts</span>
              </button>
            </li>
          ))}
        </ul>
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
        <p className="muted">@{user.handle} · {campusName(user.campus)} · {user.role === 'chair' ? 'YAC Chair' : user.role === 'admin' ? 'Admin' : 'Adventurer'} · {user.email}</p>
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
          <p className="muted" style={{ margin: 0 }}>Add at most +{TIER_POINTS[1]} at a time (one High-Impact action) so the prize race stays fair. Use a negative number to remove points or fix mistakes.</p>
          <label className="field"><span>Reason (required)</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} required /></label>
          <p className="muted">The reason is shown to the participant in their notifications.</p>
          <ErrorText error={adjErr} />
          <button className="btn blue" disabled={busy || !amount || !reason.trim()}>Adjust</button>
        </form>

        <h3>Ledger history</h3>
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

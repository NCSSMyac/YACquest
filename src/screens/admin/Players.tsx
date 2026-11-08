import { useEffect, useState, type FormEvent } from 'react';
import * as api from '../../api';
import { ACTIVITIES, activityById } from '../../lib/activities';
import { PRIZE, TIER_POINTS, campusName } from '../../config';
import { Empty, ErrorText, Loading, Modal, useToast } from '../../components/ui';
import { fmtDateTime, fmtPts, timeAgo } from '../../lib/format';
import { Accordion } from '../../components/Blocks';
import { canUndo, undoneIds, UNDO_PREFIX } from '../../lib/adminTools';
import type { LedgerEntry } from '../../types';
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

        <StaffNotes userId={user.id} name={user.displayName} />

        <Accordion flat title="Points history" glyph="scroll" summary="Manual changes can be undone once" right={ledger.data ? <span className="chip neutral">{ledger.data.length}</span> : undefined} defaultOpen>
          {ledger.loading && !ledger.data ? <Loading /> : !ledger.data?.length ? <Empty>No entries yet.</Empty> : <History ledger={ledger.data} name={user.displayName} />}
        </Accordion>

        <form className="stack" onSubmit={(e) => { e.preventDefault(); void award(activityId, note); }}>
          <h3>Award activity</h3>
          <label className="field">
            <span>Activity</span>
            <select value={activityId} onChange={(e) => setActivityId(e.target.value)}>
              {/* 0030: the in-app event survey awards itself (once per event), so it isn't offered here. */}
              {ACTIVITIES.filter((a) => a.method !== 'event_survey').map((a) => <option key={a.id} value={a.id}>{a.title} (+{TIER_POINTS[a.tier]})</option>)}
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

        <button className="btn ghost block" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

const NOTE_MAX = 500;

/** 0025: private staff notes (never shown to the player). Delete your own; YACquest Chairs can delete any. */
function StaffNotes({ userId, name }: { userId: string; name: string }) {
  const toast = useToast();
  const notes = useAsync(() => api.listPlayerNotes(userId), [userId]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const n = await api.addPlayerNote(userId, text);
      notes.setData((d) => [n, ...(d ?? [])]);
      setText('');
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  async function del(id: string) {
    if (!window.confirm('Delete this note?')) return;
    try {
      await api.deletePlayerNote(id);
      notes.setData((d) => (d ?? []).filter((n) => n.id !== id));
      toast('Note deleted.', 'success');
    } catch (x) {
      toast(errorMessage(x), 'error');
    }
  }

  const count = notes.data?.length ?? 0;
  return (
    <Accordion flat title="Staff notes" glyph="todo" summary={`Private: ${name} never sees these`} right={count ? <span className="chip t2">{count}</span> : undefined} defaultOpen className="staff-notes">
      <form className="stack" style={{ gap: 6 }} onSubmit={add}>
        <label className="field">
          <span className="sr-only">New note about {name}</span>
          <textarea rows={2} value={text} maxLength={NOTE_MAX} onChange={(e) => setText(e.target.value)} placeholder="e.g. Wants to help at the spring service day" />
        </label>
        <div className="spread">
          <small className="muted">{text.length}/{NOTE_MAX} · only staff can read notes</small>
          <button className="btn small navy" disabled={busy || !text.trim()}>{busy ? 'Saving…' : '+ Add note'}</button>
        </div>
        <ErrorText error={err} />
      </form>
      {notes.loading && !notes.data ? <Loading lines={1} /> : notes.error ? <ErrorText error={notes.error} /> : count === 0 ? (
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>No notes yet.</p>
      ) : (
        <ul className="note-list">
          {notes.data!.map((n) => (
            <li key={n.id}>
              <p className="note-body">{n.body}</p>
              <div className="note-meta">
                <span><b>{n.authorName}</b> · <time dateTime={n.createdAt} title={fmtDateTime(n.createdAt)}>{timeAgo(n.createdAt)}</time></span>
                {n.canDelete && <button type="button" className="note-del" onClick={() => void del(n.id)} aria-label={`Delete note by ${n.authorName}`}>Delete</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Accordion>
  );
}

/** Points history with "Undo" on manual changes (0025: once per change, this cycle only). */
function History({ ledger, name }: { ledger: LedgerEntry[]; name: string }) {
  const toast = useToast();
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const undone = new Set([...undoneIds(ledger), ...done]);

  async function undo(l: LedgerEntry) {
    setBusy(true);
    try {
      const r = await api.undoPointsChange(l.id);
      setDone((s) => new Set(s).add(l.id));
      setAsking(null);
      toast(`Undone: ${fmtPts(r.amount)} to ${name}.`, 'success');
    } catch (x) {
      toast(errorMessage(x), 'error');
      if ((x as { code?: string }).code === 'already_undone') setDone((s) => new Set(s).add(l.id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ul className="list ledger-list">
      {ledger.map((l) => {
        const isUndo = l.source === 'manual' && !!l.refId?.startsWith(UNDO_PREFIX);
        return (
          <li key={l.id} className="stack" style={{ gap: 6 }}>
            <div className="spread" style={{ alignItems: 'flex-start' }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {l.reason}
                <br />
                <span className="muted" style={{ fontSize: 13 }}>
                  {fmtDateTime(l.createdAt)}
                  {isUndo && <span className="chip neutral ledger-tag">↩ undo</span>}
                  {undone.has(l.id) && <span className="chip neutral ledger-tag">undone</span>}
                </span>
              </span>
              <span className="ledger-right">
                <strong style={{ color: l.amount < 0 ? 'var(--red)' : 'var(--green)' }}>{fmtPts(l.amount)}</strong>
                {canUndo(l, undone) && asking !== l.id && (
                  <button type="button" className="btn small ghost undo-btn" onClick={() => setAsking(l.id)} aria-label={`Undo ${fmtPts(l.amount)}: ${l.reason}`}>↩ Undo</button>
                )}
              </span>
            </div>
            {asking === l.id && (
              <div className="undo-ask">
                <span>Add {fmtPts(-l.amount)} to cancel this? {name} gets a notification.</span>
                <div className="btn-row">
                  <button type="button" className="btn small ghost" disabled={busy} onClick={() => setAsking(null)}>Cancel</button>
                  <button type="button" className="btn small red" disabled={busy} onClick={() => void undo(l)}>{busy ? 'Undoing…' : `Yes, undo`}</button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

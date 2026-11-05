import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../../api';
import type { AdminUserRow, TeamMember } from '../../api';
import { Empty, ErrorText, Loading, Modal, Panel, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { errorMessage, useAsync } from '../../lib/useAsync';

type Pick = { id: string; displayName: string; handle: string };

function PersonSearch({ label, onPick, exclude }: { label: string; onPick: (u: AdminUserRow) => void; exclude?: (u: AdminUserRow) => boolean }) {
  const [text, setText] = useState('');
  const list = useAsync(() => (text.trim().length >= 2 ? api.searchUsers(text.trim(), 8) : Promise.resolve([] as AdminUserRow[])), [text]);
  const rows = (list.data ?? []).filter((u) => !exclude?.(u));
  return (
    <div className="stack">
      <label className="field">
        <span>{label}</span>
        <input className="input" type="search" placeholder="Name, username or email" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {text.trim().length >= 2 && !list.loading && !rows.length && <Empty>No matches.</Empty>}
      {rows.length > 0 && (
        <ul className="list">
          {rows.map((u) => (
            <li key={u.id} className="spread">
              <span>{u.displayName} <span className="muted">@{u.handle}</span></span>
              <button className="btn small ghost" onClick={() => onPick(u)}>Select</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Team() {
  const toast = useToast();
  const nav = useNavigate();
  const { user, refresh } = useAuth();
  const team = useAsync(() => api.listTeam(), [], { live: true });
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [adding, setAdding] = useState<Pick | null>(null);
  const [handing, setHanding] = useState<Pick | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<void>, ok: string, done: () => void) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      toast(ok, 'success');
      done();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const handoverOk = handing && typed.trim().toLowerCase() === handing.handle.toLowerCase();

  return (
    <div className="stack">
      <Panel title="Roles">
        <ul className="list" style={{ margin: 0 }}>
          <li><b>Admin</b>: review submissions, award points, run events.</li>
          <li><b>Chair</b>: everything an admin does, plus team, prizes and reset. Maximum 2 chairs.</li>
        </ul>
      </Panel>

      <Panel title="Current team">
        {team.loading && !team.data ? <Loading /> : team.error ? <ErrorText error={team.error} /> : !team.data?.length ? <Empty>No team yet.</Empty> : (
          <ul className="list">
            {team.data.map((m) => (
              <li key={m.id} className="stack" style={{ gap: 4 }}>
                <div className="spread">
                  <strong>{m.displayName} <span className="muted">@{m.handle}</span></strong>
                  <span className={`chip ${m.role === 'chair' ? 't1' : 't2'}`}>{m.role === 'chair' ? 'YAC Chair' : 'Admin'}</span>
                </div>
                <span className="muted wrap-anywhere">{m.email}{!m.emailVerified && ' · email not confirmed'}</span>
                {m.role === 'admin' && <button className="btn small red" style={{ alignSelf: 'flex-start' }} onClick={() => { setErr(null); setRemoving(m); }}>Remove admin</button>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Add an admin">
        <PersonSearch label="Find a participant" exclude={(u) => u.role !== 'participant'} onPick={(u) => { setErr(null); setAdding(u); }} />
      </Panel>

      <Panel title="Hand over my chair seat" tone="flat">
        <p className="muted">You will become an admin and the person you pick becomes a YAC Chair. Only do this if you are stepping down.</p>
        <PersonSearch label="Who takes your seat?" exclude={(u) => u.id === user?.id || u.role === 'chair'} onPick={(u) => { setErr(null); setTyped(''); setHanding(u); }} />
      </Panel>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Remove admin?">
        <div className="stack">
          <p style={{ margin: 0 }}>{removing?.displayName} will go back to being a regular adventurer.</p>
          <ErrorText error={err} />
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setRemoving(null)}>Cancel</button>
            <button className="btn red" disabled={busy} onClick={() => removing && run(() => api.setRole(removing.id, 'participant'), 'Admin removed.', () => { setRemoving(null); void team.reload(); })}>{busy ? 'Saving…' : 'Remove'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!adding} onClose={() => setAdding(null)} title="Make admin?">
        <div className="stack">
          <p style={{ margin: 0 }}>{adding?.displayName} (@{adding?.handle}) will be able to review submissions, award points and run events. They must have confirmed their email.</p>
          <ErrorText error={err} />
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setAdding(null)}>Cancel</button>
            <button className="btn green" disabled={busy} onClick={() => adding && run(() => api.setRole(adding.id, 'admin'), 'Admin added.', () => { setAdding(null); void team.reload(); })}>{busy ? 'Saving…' : 'Make admin'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!handing} onClose={() => setHanding(null)} title="Hand over chair seat?">
        <div className="stack">
          <p style={{ margin: 0 }}>{handing?.displayName} becomes a YAC Chair and you become an admin. To confirm, type their username: <b>{handing?.handle}</b></p>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type their username" autoCapitalize="none" />
          <ErrorText error={err} />
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setHanding(null)}>Cancel</button>
            <button
              className="btn red"
              disabled={busy || !handoverOk}
              onClick={() => handing && run(() => api.transferChair(handing.id), 'Chair seat handed over.', () => { setHanding(null); void refresh().then(() => nav('/admin')); })}
            >{busy ? 'Saving…' : 'Hand over'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
